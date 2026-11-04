// The ONLY module that talks to the official Lean 4 extension (`leanprover.lean4`).
// Everything that depends on its (unpublished, internal) API lives here.

import * as path from 'node:path';
import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Minimal local view of the official extension's exports.
// Verified against vscode-lean4 v0.0.240/v0.0.241 (`src/exports.ts`, `src/leanclient.ts`,
// `src/utils/clientProvider.ts`, `src/utils/exturi.ts`). Only the members we use.
// ---------------------------------------------------------------------------

/** `ExtUri` from vscode-lean4: either `FileUri` or `UntitledUri`. */
type LeanExtUri = { scheme: 'file'; fsPath: string } | { scheme: 'untitled'; path: string };

interface LeanClient {
  isRunning(): boolean;
  getClientFolder(): LeanExtUri;
  /** Rejects with the plain string `'No connection to Lean'` when the client is not running. */
  sendRequest(method: string, params: unknown, token?: vscode.CancellationToken): Promise<unknown>;
  sendNotification(method: string, params: unknown): Promise<void> | undefined;
  restarted: vscode.Event<void>;
  /** Fires with the document URI (string) whose worker was restarted. */
  restartedWorker: vscode.Event<string>;
  stopped: vscode.Event<unknown>;
  didClose: vscode.Event<{ textDocument: { uri: string } }>;
}

interface LeanClientProvider {
  getActiveClient(): LeanClient | undefined;
  getClients(): LeanClient[];
  clientAdded: vscode.Event<LeanClient>;
  clientRemoved: vscode.Event<LeanClient>;
}

interface Lean4Exports {
  lean4EnabledFeatures: Promise<{ clientProvider: LeanClientProvider }>;
}

// ---------------------------------------------------------------------------
// Protocol constants (verified in lean4 `src/Lean/Data/JsonRpc.lean`, v4.34.1).
// ---------------------------------------------------------------------------

/** The RPC method is not registered (e.g. the companion package is not imported). */
export const ERR_METHOD_NOT_FOUND = -32601;
const ERR_REQUEST_CANCELLED = -32800;
const ERR_CONTENT_MODIFIED = -32801;
const ERR_RPC_NEEDS_RECONNECT = -32900;
const ERR_WORKER_EXITED = -32901;
const ERR_WORKER_CRASHED = -32902;

/** The server expires RPC sessions after 30 s without keep-alive (`keepAliveTimeMs`). */
const KEEP_ALIVE_INTERVAL_MS = 10_000;

export type BridgeState = 'waiting' | 'ready' | 'unavailable';

export interface Position {
  line: number;
  character: number;
}

/** Thrown (or rejected with) when a request was cancelled; callers should ignore it silently. */
export class CancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}

interface RpcSession {
  client: LeanClient;
  uri: string;
  /** RPC session ids are UInt64 encoded as JSON strings by Lean (`bignumToJson`). */
  sessionId: Promise<string>;
  keepAlive?: NodeJS.Timeout;
}

export class LeanBridge implements vscode.Disposable {
  private state: BridgeState = 'waiting';
  private provider: LeanClientProvider | undefined;
  private readonly sessions = new Map<string, RpcSession>();
  private readonly clientSubscriptions = new Map<LeanClient, vscode.Disposable[]>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly stateEmitter = new vscode.EventEmitter<BridgeState>();
  private disposed = false;

  readonly onDidChangeState = this.stateEmitter.event;

  constructor(private readonly log: vscode.LogOutputChannel) {}

  get currentState(): BridgeState {
    return this.state;
  }

  /** Starts connecting in the background. Never blocks on the Lean extension. */
  start(): void {
    void this.connect();
  }

  private async connect(): Promise<void> {
    const ext = vscode.extensions.getExtension<Lean4Exports>('leanprover.lean4');
    if (!ext) {
      this.log.error('Extension leanprover.lean4 is not installed.');
      this.setState('unavailable');
      return;
    }
    this.log.info(`Waiting for Lean (leanprover.lean4 v${String(ext.packageJSON.version)})...`);
    let exports: Lean4Exports;
    try {
      exports = ext.isActive ? ext.exports : await ext.activate();
    } catch (e) {
      this.log.error(`Failed to activate leanprover.lean4: ${describeError(e)}`);
      this.setState('unavailable');
      return;
    }
    // This promise may take a long time or never resolve (e.g. no Lean file opened yet,
    // failed installation). We just wait; nothing else depends on it.
    let features: { clientProvider: LeanClientProvider };
    try {
      features = await exports.lean4EnabledFeatures;
    } catch (e) {
      this.log.error(`lean4EnabledFeatures rejected: ${describeError(e)}`);
      this.setState('unavailable');
      return;
    }
    if (this.disposed) return;

    this.provider = features.clientProvider;
    this.disposables.push(
      this.provider.clientAdded((c) => this.attachClient(c)),
      this.provider.clientRemoved((c) => this.detachClient(c)),
    );
    for (const c of this.provider.getClients()) this.attachClient(c);
    this.log.info(`Lean features available (${this.provider.getClients().length} client(s)).`);
    this.setState('ready');
  }

  private setState(s: BridgeState): void {
    this.state = s;
    this.stateEmitter.fire(s);
  }

  private attachClient(client: LeanClient): void {
    if (this.clientSubscriptions.has(client)) return;
    const folder = describeFolder(client.getClientFolder());
    this.log.info(`Client attached: ${folder}`);
    this.clientSubscriptions.set(client, [
      client.restarted(() => {
        this.log.info(`Server restarted (${folder}); dropping its RPC sessions.`);
        this.dropSessions((s) => s.client === client);
      }),
      client.stopped(() => {
        this.log.info(`Server stopped (${folder}); dropping its RPC sessions.`);
        this.dropSessions((s) => s.client === client);
      }),
      client.restartedWorker((uri) => {
        this.log.info(`Worker restarted for ${uri}; dropping its RPC session.`);
        this.dropSessions((s) => s.client === client && s.uri === uri);
      }),
      client.didClose((p) => {
        this.dropSessions((s) => s.client === client && s.uri === p.textDocument.uri);
      }),
    ]);
  }

  private detachClient(client: LeanClient): void {
    this.log.info(`Client removed: ${describeFolder(client.getClientFolder())}`);
    this.dropSessions((s) => s.client === client);
    for (const d of this.clientSubscriptions.get(client) ?? []) d.dispose();
    this.clientSubscriptions.delete(client);
  }

  /**
   * Picks the client whose folder contains the document (longest match wins).
   * We cannot use `findClient(uri)` because it requires an internal `ExtUri`.
   */
  clientFor(uri: vscode.Uri): LeanClient | undefined {
    if (!this.provider) return undefined;
    let best: LeanClient | undefined;
    let bestLen = -1;
    for (const c of this.provider.getClients()) {
      const folder = c.getClientFolder();
      if (folder.scheme === 'file' && uri.scheme === 'file') {
        const f = folder.fsPath;
        if ((uri.fsPath === f || uri.fsPath.startsWith(f + path.sep)) && f.length > bestLen) {
          best = c;
          bestLen = f.length;
        }
      } else if (folder.scheme === 'untitled' && bestLen < 0) {
        // Ad-hoc client for files outside any Lake project (and untitled documents).
        best = c;
        bestLen = 0;
      }
    }
    return best ?? this.provider.getActiveClient();
  }

  // -------------------------------------------------------------------------
  // Requests
  // -------------------------------------------------------------------------

  /** `$/lean/plainGoal`: `{ rendered, goals } | null`. Only used as a check and fallback. */
  async plainGoal(uri: vscode.Uri, position: Position, token: vscode.CancellationToken): Promise<unknown> {
    const client = this.requireClient(uri);
    return this.request(client, '$/lean/plainGoal', { textDocument: { uri: uri.toString() }, position }, token);
  }

  /**
   * `Lean.Widget.getInteractiveGoals` over RPC: `{ goals: InteractiveGoal[] } | null`.
   * The RPC references in the result (`SubexprInfo.info`, `InteractiveGoal.ctx`) are released
   * immediately, so they must not be used for follow-up calls.
   */
  async interactiveGoals(uri: vscode.Uri, position: Position, token: vscode.CancellationToken): Promise<unknown> {
    const params = { textDocument: { uri: uri.toString() }, position };
    return this.rpcCall(uri, position, 'Lean.Widget.getInteractiveGoals', params, token, { releaseRefs: true });
  }

  /**
   * Precise mode: the companion package's `getGoalsLatex`. Rejects with code
   * `ERR_METHOD_NOT_FOUND` if the package is not imported in this file.
   */
  async preciseGoals(
    uri: vscode.Uri,
    position: Position,
    method: string,
    rules: unknown,
    token: vscode.CancellationToken,
    interactive = false,
  ): Promise<unknown> {
    const params = { textDocument: { uri: uri.toString() }, position, rules, interactive };
    // The response holds no RPC references, so there is nothing to release.
    return this.rpcCall(uri, position, method, params, token, { releaseRefs: false });
  }

  /**
   * `Lean.Widget.getInteractiveDiagnostics` for one line. The result's RPC references stay alive
   * (the precise mode passes them back to Lean) until `release` is called.
   */
  async interactiveDiagnostics(
    uri: vscode.Uri,
    line: number,
    token: vscode.CancellationToken,
  ): Promise<{ result: unknown; release: () => void }> {
    let release = () => {};
    const position = { line, character: 0 };
    const result = await this.rpcCall(
      uri,
      position,
      'Lean.Widget.getInteractiveDiagnostics',
      { lineRange: { start: line, end: line + 1 } },
      token,
      { releaseRefs: false, onKeep: (r) => (release = r) },
    );
    return { result, release };
  }

  /** Precise mode: LaTeX for expressions given by their info references (`exprsLatex`). */
  async exprsLatex(
    uri: vscode.Uri,
    line: number,
    method: string,
    infos: unknown[],
    rules: unknown,
    token: vscode.CancellationToken,
  ): Promise<unknown> {
    const position = { line, character: 0 };
    // All fields explicit: the derived `RpcEncodable` decoder does not apply Lean defaults.
    return this.rpcCall(uri, position, method, { infos, rules, interactive: false }, token, { releaseRefs: false });
  }

  /** `Lean.Widget.getInteractiveTermGoal`: expected type at the position (term mode) or `null`. */
  async interactiveTermGoal(uri: vscode.Uri, position: Position, token: vscode.CancellationToken): Promise<unknown> {
    const params = { textDocument: { uri: uri.toString() }, position };
    return this.rpcCall(uri, position, 'Lean.Widget.getInteractiveTermGoal', params, token, { releaseRefs: true });
  }

  private async rpcCall(
    uri: vscode.Uri,
    position: Position,
    method: string,
    params: unknown,
    token: vscode.CancellationToken,
    /** `onKeep` receives a function that releases the result's references later. */
    opts: { releaseRefs: boolean; onKeep?: (release: () => void) => void },
  ): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const client = this.requireClient(uri);
      const session = this.getSession(client, uri.toString());
      const sessionId = await session.sessionId;
      if (token.isCancellationRequested) throw new CancelledError();
      try {
        const result = await this.request(
          client,
          '$/lean/rpc/call',
          { sessionId, method, params, textDocument: { uri: uri.toString() }, position },
          token,
        );
        if (opts.releaseRefs) this.releaseRefs(client, uri.toString(), sessionId, result);
        opts.onKeep?.(() => this.releaseRefs(client, uri.toString(), sessionId, result));
        return result;
      } catch (e) {
        if (errorCode(e) === ERR_RPC_NEEDS_RECONNECT && attempt === 0) {
          this.log.warn(`RPC session ${sessionId} outdated for ${uri.toString()}; reconnecting.`);
          this.dropSessions((s) => s === session);
          continue;
        }
        const code = errorCode(e);
        if (code === ERR_RPC_NEEDS_RECONNECT || code === ERR_WORKER_EXITED || code === ERR_WORKER_CRASHED) {
          // The session is dead; the next call will connect a fresh one.
          this.dropSessions((s) => s === session);
        }
        throw e;
      }
    }
  }

  private getSession(client: LeanClient, uri: string): RpcSession {
    const existing = this.sessions.get(uri);
    if (existing && existing.client === client) return existing;
    if (existing) this.dropSessions((s) => s === existing);

    const session: RpcSession = {
      client,
      uri,
      sessionId: (async () => {
        const t0 = performance.now();
        const res = (await client.sendRequest('$/lean/rpc/connect', { uri })) as { sessionId: string };
        this.log.info(`RPC session ${res.sessionId} connected for ${uri} (${ms(t0)}).`);
        return res.sessionId;
      })(),
    };
    this.sessions.set(uri, session);

    session.sessionId.then(
      (sessionId) => {
        if (this.sessions.get(uri) !== session) return; // dropped while connecting
        session.keepAlive = setInterval(() => {
          if (!client.isRunning()) return;
          client
            .sendNotification('$/lean/rpc/keepAlive', { uri, sessionId })
            ?.catch((e: unknown) => this.log.warn(`keepAlive failed: ${describeError(e)}`));
        }, KEEP_ALIVE_INTERVAL_MS);
      },
      (e: unknown) => {
        this.log.error(`RPC connect failed for ${uri}: ${describeError(e)}`);
        if (this.sessions.get(uri) === session) this.sessions.delete(uri);
      },
    );
    return session;
  }

  /** Without this, every call leaks server-side objects until the session expires. */
  private releaseRefs(client: LeanClient, uri: string, sessionId: string, result: unknown): void {
    const refs: unknown[] = [];
    collectRpcRefs(result, refs);
    if (refs.length === 0 || !client.isRunning()) return;
    client
      .sendNotification('$/lean/rpc/release', { uri, sessionId, refs })
      ?.catch((e: unknown) => this.log.warn(`rpc/release failed: ${describeError(e)}`));
  }

  private dropSessions(pred: (s: RpcSession) => boolean): void {
    for (const [uri, s] of this.sessions) {
      if (!pred(s)) continue;
      if (s.keepAlive) clearInterval(s.keepAlive);
      this.sessions.delete(uri);
    }
  }

  private requireClient(uri: vscode.Uri): LeanClient {
    const client = this.clientFor(uri);
    if (!client) throw new Error(this.state === 'ready' ? 'No Lean client for this document.' : 'Waiting for Lean.');
    return client;
  }

  private async request(
    client: LeanClient,
    method: string,
    params: unknown,
    token: vscode.CancellationToken,
  ): Promise<unknown> {
    try {
      return await client.sendRequest(method, params, token);
    } catch (e) {
      const code = errorCode(e);
      if (token.isCancellationRequested || code === ERR_REQUEST_CANCELLED || code === ERR_CONTENT_MODIFIED) {
        throw new CancelledError();
      }
      throw e;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.dropSessions(() => true);
    for (const subs of this.clientSubscriptions.values()) for (const d of subs) d.dispose();
    this.clientSubscriptions.clear();
    for (const d of this.disposables) d.dispose();
    this.stateEmitter.dispose();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function errorCode(e: unknown): number | undefined {
  if (typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'number') return e.code;
  return undefined;
}

export function describeError(e: unknown): string {
  if (typeof e === 'string') return e;
  const code = errorCode(e);
  const msg = e instanceof Error ? e.message : JSON.stringify(e);
  return code === undefined ? msg : `[${code}] ${msg}`;
}

/**
 * RPC references are objects with a single string field: `__rpcref` with wire format v1 (what
 * the official client negotiates) or `p` with v0. Same detection as the official InfoView.
 */
function collectRpcRefs(v: unknown, out: unknown[]): void {
  if (Array.isArray(v)) {
    for (const x of v) collectRpcRefs(x, out);
  } else if (typeof v === 'object' && v !== null) {
    const keys = Object.keys(v);
    const rec = v as Record<string, unknown>;
    if (keys.length === 1 && (keys[0] === '__rpcref' || keys[0] === 'p') && typeof rec[keys[0]] === 'string') {
      out.push(v);
      return;
    }
    for (const x of Object.values(rec)) collectRpcRefs(x, out);
  }
}

function describeFolder(f: LeanExtUri): string {
  return f.scheme === 'file' ? f.fsPath : `untitled:${f.path}`;
}

export function ms(t0: number): string {
  return `${(performance.now() - t0).toFixed(1)} ms`;
}

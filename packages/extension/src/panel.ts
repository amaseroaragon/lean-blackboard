// Sidebar WebviewView that displays the current PanelState.

import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { HostMessage, PanelState, WebviewMessage } from '@lean-blackboard/core';
import type { Settings } from './settings';

export class GoalsPanel implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'leanBlackboard.goals';

  private view: vscode.WebviewView | undefined;
  /** The webview script has loaded and can receive messages. */
  private ready = false;
  private state: PanelState = { kind: 'waiting' };
  private readonly visibilityEmitter = new vscode.EventEmitter<boolean>();
  private readonly revealEmitter = new vscode.EventEmitter<number>();
  private readonly disposables: vscode.Disposable[] = [];

  /** Fires when the panel becomes visible or hidden. */
  readonly onDidChangeVisibility = this.visibilityEmitter.event;
  /** Fires with a 0-based line when a message is clicked: the Lean editor should show it. */
  readonly onDidRequestReveal = this.revealEmitter.event;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly settings: Settings,
  ) {
    this.disposables.push(settings.onDidChangeView(() => this.postConfig()));
  }

  /** What the panel currently shows (for commands such as "copy goal state"). */
  get currentState(): PanelState {
    return this.state;
  }

  /** Asks the webview to pin what it currently shows. */
  pin(): void {
    this.send({ type: 'pin' });
  }

  get visible(): boolean {
    return this.view?.visible ?? false;
  }

  setState(state: PanelState): void {
    this.state = state;
    this.post();
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.ready = false;
    const webview = view.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
    };
    webview.onDidReceiveMessage((m: WebviewMessage) => {
      switch (m.type) {
        case 'ready':
          this.ready = true;
          this.postConfig();
          this.post();
          break;
        case 'goto': {
          // Only local files (declarations come from the Lean server's search path).
          const uri = vscode.Uri.parse(m.uri);
          if (uri.scheme !== 'file') break;
          const pos = new vscode.Position(m.line, m.character);
          void vscode.window.showTextDocument(uri, { selection: new vscode.Range(pos, pos), preview: true });
          break;
        }
        case 'reveal':
          // Click on a message: whoever follows the Lean editor knows which one it is.
          if (Number.isInteger(m.line) && m.line >= 0) this.revealEmitter.fire(m.line);
          break;
        case 'copy':
          void vscode.env.clipboard.writeText(m.text).then(() => {
            vscode.window.setStatusBarMessage('Lean Blackboard: LaTeX copied', 2000);
          });
          break;
      }
    });
    view.onDidChangeVisibility(() => {
      // Hidden webviews are torn down; the script sends `ready` again when shown.
      if (!view.visible) this.ready = false;
      this.visibilityEmitter.fire(view.visible);
    });
    view.onDidDispose(() => {
      this.view = undefined;
      this.ready = false;
      this.visibilityEmitter.fire(false);
    });
    webview.html = this.html(webview);
    this.visibilityEmitter.fire(view.visible);
  }

  private post(): void {
    this.send({ type: 'state', state: this.state });
  }

  private postConfig(): void {
    this.send({ type: 'config', config: this.settings.view });
  }

  private send(msg: HostMessage): void {
    if (!this.view || !this.ready) return;
    void this.view.webview.postMessage(msg);
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('base64');
    // Built by `packages/webview`: script, CSS (panel + KaTeX) and KaTeX fonts.
    const base = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(base, 'webview.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(base, 'webview.css'));
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${style.toString()}">
  <title>Lean Blackboard</title>
</head>
<body>
  <main id="root"></main>
  <script nonce="${nonce}" src="${script.toString()}"></script>
</body>
</html>`;
  }

  dispose(): void {
    this.visibilityEmitter.dispose();
    this.revealEmitter.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

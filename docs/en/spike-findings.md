# Phase 0: spike findings

**English** · [Español](../es/spike-findings.md)

Date: 2026-11-04. Environment: VS Code 1.144.0, `leanprover.lean4` **v0.0.240** (CLAUDE.md was
verified against v0.0.241), Lean `v4.34.1`, Node 22.

Sources of information:

- **Verified (code reading)**: Lean source in the installed toolchain and the bundle of the
  installed extension (`~/.vscode/extensions/leanprover.lean4-0.0.240/dist/extension.js`).
- **Verified (LSP probe)**: a minimal script that speaks LSP with `lake serve` on
  `examples/lean-sample`, **outside** the extension. Used to see the server's real shapes and
  latencies; it does not replace testing with F5.
- **Pending (F5)**: what can only be observed in the Extension Development Host.

## Official extension API (v0.0.240)

Everything described in CLAUDE.md exists in v0.0.240 with the same shape. Additional details:

- `getClientFolder()` returns an `ExtUri`: `{ scheme: 'file', fsPath }` or
  `{ scheme: 'untitled', path }` (the "ad hoc" client for files outside a Lake project). We pick
  the client by comparing `fsPath` (longest prefix) and fall back to `getActiveClient()`.
- `restartedWorker` emits the **document URI as a string**.
- `didClose` emits `DidCloseTextDocumentParams`: `{ textDocument: { uri } }`.
- `sendRequest` rejects with the **string** `'No connection to Lean'` (not an `Error`) if the
  client is not running. Server errors arrive as a `ResponseError` with `.code`.
- `getActiveClient()` internally uses `findClient(lastActiveLeanEditor.documentExtUri)`.

## RPC protocol

- **`sessionId` is a string**, not a number: Lean encodes `UInt64` as a decimal string
  (`bignumToJson`), e.g. `"7379897472780602556"`. Sending it as a number gives `-32602`
  (`RpcCallParams.sessionId: String expected`). Upside: no precision loss in JS.
- Error codes (`Lean/Data/JsonRpc.lean`):
  - `-32900` `RpcNeedsReconnect`, message `"Outdated RPC session"`. Checked in the probe with a
    made-up `sessionId`. This is what triggers our reconnect + retry.
  - `-32901` `WorkerExited`, `-32902` `WorkerCrashed`: the official InfoView also drops the
    session on these. We drop the session without retrying; the next request reconnects.
  - `-32800` `RequestCancelled`, `-32801` `ContentModified`: treated as silent cancellation.
- Expiry: `keepAliveTimeMs = 30000` (`FileWorker/Utils.lean`). Keep-alive every 10 s.
- **Surprise: RPC references must be released.** Each `getInteractiveGoals` creates objects on the
  server (`SubexprInfo.info` and `InteractiveGoal.ctx`) that live until the client sends
  `$/lean/rpc/release` `{ uri, sessionId, refs }` or the session expires. Since our session lives
  as long as the file is open, not releasing them would leak on every cursor move. The spike
  released them right after each call (they were not used yet).
- **The reference format depends on the wire format.** The official extension negotiates
  `rpcWireFormat: "v1"` in `initialize`, so in VS Code refs are `{"__rpcref": "N"}`. The probe
  (without that capability, format `v0`) sees them as `{"p": "N"}`. The code detects both, like the
  InfoView.

## Real responses (probe, cursor on `exact hpq hp` in `imp_trans`)

`$/lean/plainGoal`:

```json
{"goals":["p q r : Prop\nhpq : p → q\nhqr : q → r\nhp : p\n⊢ q"],
 "rendered":"```lean\np q r : Prop\nhpq : p → q\nhqr : q → r\nhp : p\n⊢ q\n```"}
```

On a line without a tactic it returns `null`.

`Lean.Widget.getInteractiveGoals` (abridged, format v0):

```json
{"goals":[{
  "ctx":{"p":"9"}, "goalPrefix":"⊢ ", "mvarId":"_uniq.33.16", "isRemoved":true,
  "hyps":[
    {"names":["p","q","r"], "fvarIds":["_uniq.33.2","_uniq.33.3","_uniq.33.4"], "isType":true,
     "type":{"tag":[{"info":{"p":"0"},"subexprPos":"/"},{"text":"Prop"}]}},
    {"names":["hpq"], "fvarIds":["_uniq.33.6"],
     "type":{"tag":[{"info":{"p":"1"},"subexprPos":"/"},
       {"append":[{"tag":[{"info":{"p":"2"},"subexprPos":"/0"},{"text":"p"}]},
                  {"text":" → "},
                  {"tag":[{"info":{"p":"3"},"subexprPos":"/1"},{"text":"q"}]}]}]}}
  ],
  "type":{"tag":[{"info":{"p":"8"},"subexprPos":"/"},{"text":"q"}]}
}]}
```

Observations:

- Hypotheses come **bundled** (`names` is an array: `p q r : Prop`).
- Optional fields (`isType`, `isInserted`, `isRemoved`, `val`...) only appear when they are true
  or present.
- `subexprPos` is a path in the `Expr` tree (`/`, `/0`, `/1`...). Useful later.
- The text of `→` is a `{"text":" → "}` node between two `tag`s: the `TaggedText` structure mirrors
  the application but **does not say which notation it is**. Phase 2 has to recognise notations
  from the separators' text (or use precise mode).

## Latencies (probe, file already elaborated)

| Request | Latency |
|---|---|
| `plainGoal` | 2–9 ms |
| `rpc/connect` | ~3 ms |
| `getInteractiveGoals` (first / following) | ~12 ms / ~3 ms |

With a 150 ms debounce, server latency is irrelevant for small files.

## Acceptance criteria: automated verification

What was left to observe with F5 is now verified by the integration tests
(`npm run test:integration`, real VS Code + official extension; run locally on 2026-11-04):

- [x] Without Lean files the extension activates and waits without errors.
- [x] A single `lake serve` per project (counting only the test instance's processes).
- [x] The RPC session stays alive after more than 30 s idle (keep-alive).
- [x] After `Lean 4: Restart Server` the goals come back without intervention.
- [x] Real shapes with the official client: references `{"__rpcref": "N"}` (wire format v1),
  checked against the server in the end-to-end tests.
- [x] Latencies: 3–8 ms per request in small files; with Mathlib, 5–30 ms once elaborated.
- [ ] The official InfoView keeps working the same: not automatable (visual check).

Finding from the tests: if the first precise-mode attempt failed while Lean was still loading the
imports, the file stayed in fast mode for 30 s. Fixed: it retries when the diagnostics change (a
sign that elaboration is progressing).

## Corrections to CLAUDE.md (applied)

1. The "needs reconnect" code is **`-32900`** (`"Outdated RPC session"`); add that
   `-32901`/`-32902` also invalidate the session.
2. State that `sessionId` is a **string** (decimal UInt64) and must be sent as is.
3. Add that **RPC references must be released** with `$/lean/rpc/release` and that their format is
   `{"__rpcref": "N"}` (the official client's wire format v1).
4. Detail the event payloads (`restartedWorker` → URI string; `didClose` →
   `{ textDocument: { uri } }`) and the shape of the `ExtUri` returned by `getClientFolder()`.
5. `sendRequest` rejects with a string, not an `Error`.
6. Note that the API is identical in v0.0.240 (the installed one) and v0.0.241.

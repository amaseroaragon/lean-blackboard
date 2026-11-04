// Sidebar WebviewView that displays the current PanelState.

import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { HostMessage, PanelState, WebviewMessage } from '@lean-blackboard/core';

export class GoalsPanel implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'leanBlackboard.goals';

  private view: vscode.WebviewView | undefined;
  /** The webview script has loaded and can receive messages. */
  private ready = false;
  private state: PanelState = { kind: 'waiting' };
  private readonly visibilityEmitter = new vscode.EventEmitter<boolean>();

  /** Fires when the panel becomes visible or hidden. */
  readonly onDidChangeVisibility = this.visibilityEmitter.event;

  constructor(private readonly extensionUri: vscode.Uri) {}

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
      if (m.type === 'ready') {
        this.ready = true;
        this.post();
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
    if (!this.view || !this.ready) return;
    const msg: HostMessage = { type: 'state', state: this.state };
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
  }
}

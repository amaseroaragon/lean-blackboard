import * as vscode from 'vscode';
import { GoalTracker } from './goalTracker';
import { LeanBridge } from './leanBridge';
import { GoalsPanel } from './panel';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Lean Blackboard', { log: true });
  const bridge = new LeanBridge(log);
  const panel = new GoalsPanel(context.extensionUri);
  const tracker = new GoalTracker(bridge, panel, log);

  context.subscriptions.push(
    log,
    bridge,
    panel,
    tracker,
    vscode.window.registerWebviewViewProvider(GoalsPanel.viewType, panel),
    vscode.commands.registerCommand('leanBlackboard.dumpGoals', () => tracker.dumpActive()),
  );

  // Connect in the background: never block activation on the Lean extension.
  bridge.start();
}

export function deactivate(): void {}

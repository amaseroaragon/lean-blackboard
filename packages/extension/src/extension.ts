import * as vscode from 'vscode';
import { GoalTracker } from './goalTracker';
import { LeanBridge } from './leanBridge';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Lean Blackboard', { log: true });
  const bridge = new LeanBridge(log);
  const tracker = new GoalTracker(bridge, log);

  context.subscriptions.push(
    log,
    bridge,
    tracker,
    vscode.commands.registerCommand('leanBlackboard.dumpGoals', () => tracker.dumpActive()),
  );

  // Connect in the background: never block activation on the Lean extension.
  bridge.start();
}

export function deactivate(): void {}

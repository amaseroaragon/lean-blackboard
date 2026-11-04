import * as vscode from 'vscode';
import { GoalTracker } from './goalTracker';
import { LeanBridge } from './leanBridge';
import { GoalsPanel } from './panel';
import { Settings } from './settings';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Lean Blackboard', { log: true });
  const bridge = new LeanBridge(log);
  const settings = new Settings(context.globalState, log);
  const panel = new GoalsPanel(context.extensionUri, settings);
  const tracker = new GoalTracker(bridge, panel, settings, log);

  context.subscriptions.push(
    log,
    bridge,
    settings,
    panel,
    tracker,
    vscode.window.registerWebviewViewProvider(GoalsPanel.viewType, panel),
    vscode.commands.registerCommand('leanBlackboard.dumpGoals', () => tracker.dumpActive()),
    vscode.commands.registerCommand('leanBlackboard.showLean', () => settings.setNotation('lean')),
    vscode.commands.registerCommand('leanBlackboard.showMath', () => settings.setNotation('math')),
    vscode.commands.registerCommand('leanBlackboard.toggleNotation', () =>
      settings.setNotation(settings.view.notation === 'math' ? 'lean' : 'math'),
    ),
  );

  // Connect in the background: never block activation on the Lean extension.
  bridge.start();
}

export function deactivate(): void {}

import { goalsToLatexDocument } from '@lean-blackboard/core';
import type { PanelState } from '@lean-blackboard/core';
import * as vscode from 'vscode';
import { GoalTracker } from './goalTracker';
import { LeanBridge } from './leanBridge';
import { GoalsPanel } from './panel';
import { Settings } from './settings';

/** Returned from `activate`; used by the integration tests to observe the panel. */
export interface LeanBlackboardApi {
  panelState(): PanelState;
}

export function activate(context: vscode.ExtensionContext): LeanBlackboardApi {
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
    vscode.commands.registerCommand('leanBlackboard.copyGoalState', async () => {
      const state = panel.currentState;
      if (state.kind !== 'goals') {
        void vscode.window.showInformationMessage('Lean Blackboard: no goals to copy.');
        return;
      }
      await vscode.env.clipboard.writeText(goalsToLatexDocument(state.goals, state.termGoal));
      vscode.window.setStatusBarMessage('Lean Blackboard: goal state copied as LaTeX', 2000);
    }),
    vscode.commands.registerCommand('leanBlackboard.toggleNotation', () =>
      settings.setNotation(settings.view.notation === 'math' ? 'lean' : 'math'),
    ),
  );

  // Connect in the background: never block activation on the Lean extension.
  bridge.start();
  return { panelState: () => panel.currentState };
}

export function deactivate(): void {}

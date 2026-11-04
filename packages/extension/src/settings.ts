// User settings: custom rules, KaTeX macros and the global notation toggle.

import { defaultRules, mergeUserRules, sanitizeMacros } from '@lean-blackboard/core';
import type { Notation, Rules, ViewConfig } from '@lean-blackboard/core';
import * as vscode from 'vscode';

const SECTION = 'leanBlackboard';
const NOTATION_KEY = 'leanBlackboard.notation';
/** Context key used by the view title buttons (`when` clauses in package.json). */
const NOTATION_CONTEXT = 'leanBlackboard.notation';

export class Settings implements vscode.Disposable {
  private _rules: Rules = defaultRules;
  private _macros: Record<string, string> = {};
  private _notation: Notation;
  private readonly rulesEmitter = new vscode.EventEmitter<void>();
  private readonly viewEmitter = new vscode.EventEmitter<ViewConfig>();
  private readonly disposables: vscode.Disposable[] = [];

  /** Conversion rules changed: goals must be converted again. */
  readonly onDidChangeRules = this.rulesEmitter.event;
  /** Display settings changed: the webview re-renders without a new request. */
  readonly onDidChangeView = this.viewEmitter.event;

  constructor(
    private readonly state: vscode.Memento,
    private readonly log: vscode.LogOutputChannel,
  ) {
    this._notation = state.get<Notation>(NOTATION_KEY) === 'lean' ? 'lean' : 'math';
    void vscode.commands.executeCommand('setContext', NOTATION_CONTEXT, this._notation);
    this.load();
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration(SECTION)) return;
        const rulesChanged = e.affectsConfiguration(`${SECTION}.customRules`);
        this.load();
        if (rulesChanged) this.rulesEmitter.fire();
        this.viewEmitter.fire(this.view);
      }),
    );
  }

  get rules(): Rules {
    return this._rules;
  }

  get view(): ViewConfig {
    return { notation: this._notation, macros: this._macros };
  }

  async setNotation(notation: Notation): Promise<void> {
    this._notation = notation;
    await this.state.update(NOTATION_KEY, notation);
    await vscode.commands.executeCommand('setContext', NOTATION_CONTEXT, notation);
    this.viewEmitter.fire(this.view);
  }

  private load(): void {
    const config = vscode.workspace.getConfiguration(SECTION);
    const merged = mergeUserRules(defaultRules, config.get('customRules'));
    const macros = sanitizeMacros(config.get('macros'));
    this._rules = merged.rules;
    this._macros = macros.macros;
    const warnings = [...merged.warnings, ...macros.warnings];
    for (const w of warnings) this.log.warn(`Settings: ${w}`);
    if (warnings.length > 0) {
      void vscode.window
        .showWarningMessage(`Lean Blackboard: ${warnings.length} invalid setting(s) ignored.`, 'Show Details')
        .then((choice) => {
          if (choice) this.log.show(true);
        });
    }
  }

  dispose(): void {
    this.rulesEmitter.dispose();
    this.viewEmitter.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

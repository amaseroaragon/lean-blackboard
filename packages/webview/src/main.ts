// Webview script: renders PanelState with KaTeX. Built with DOM APIs only (no innerHTML), and
// KaTeX's `render` builds DOM nodes with CSSOM styles, so it works under a strict CSP without
// `'unsafe-inline'`.

import type {
  GoalView,
  HostMessage,
  HypView,
  Notation,
  PanelState,
  ViewConfig,
  WebviewMessage,
} from '@lean-blackboard/core';
import { goalsToLatexDocument } from '@lean-blackboard/core';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './panel.css';

/** Persisted across hide/show of the view (the webview is recreated). */
interface SavedState {
  /** Notation the overrides were made against: they are dropped when the global one changes. */
  notation?: Notation;
  /** Per-row notation that differs from the global one, keyed by row id. */
  overrides?: Record<string, Notation>;
}

declare function acquireVsCodeApi(): {
  postMessage(msg: WebviewMessage): void;
  getState(): SavedState | undefined;
  setState(state: SavedState): void;
};

const vscode = acquireVsCodeApi();
const root = document.getElementById('root') as HTMLElement;

let panelState: PanelState = { kind: 'waiting' };
let config: ViewConfig = { notation: 'math', macros: {} };
const saved = vscode.getState() ?? {};
let overrides: Record<string, Notation> = saved.overrides ?? {};

/** One displayable formula: a hypothesis or a goal target. */
interface Row {
  key: string;
  latex: string;
  lean: string;
  className: string;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

function message(text: string, className = 'message'): HTMLElement {
  return el('p', className, text);
}

function button(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', 'action', label);
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Renders LaTeX. If KaTeX rejects it (a conversion bug or a bad user rule/macro), shows the
 * Lean text instead, so the panel is never empty.
 */
function renderMath(target: HTMLElement, latex: string, lean: string): void {
  try {
    katex.render(`\\displaystyle ${latex}`, target, {
      throwOnError: true,
      displayMode: false,
      strict: 'ignore',
      trust: false,
      maxExpand: 1000,
      maxSize: 20,
      // KaTeX may mutate the object (\gdef): give it a copy.
      macros: { ...config.macros },
    });
    target.title = lean;
  } catch (e) {
    target.replaceChildren(el('span', 'code fallback', lean));
    target.title = `KaTeX could not render: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function notationOf(key: string): Notation {
  return overrides[key] ?? config.notation;
}

function toggleRow(key: string): void {
  const flipped: Notation = notationOf(key) === 'math' ? 'lean' : 'math';
  if (flipped === config.notation) delete overrides[key];
  else overrides[key] = flipped;
  persist();
  render();
}

function persist(): void {
  vscode.setState({ notation: config.notation, overrides });
}

function renderRow(row: Row): HTMLElement {
  const notation = notationOf(row.key);
  const content = el('div', 'content');
  if (notation === 'math') renderMath(content, row.latex, row.lean);
  else content.append(el('span', 'code', row.lean));

  const actions = el(
    'div',
    'actions',
    button(notation === 'math' ? 'Lean' : 'Math', notation === 'math' ? 'Show Lean syntax' : 'Show math notation', () =>
      toggleRow(row.key),
    ),
    button('Copy', 'Copy LaTeX', () => vscode.postMessage({ type: 'copy', text: row.latex })),
  );
  return el('div', `row ${row.className}`, content, actions);
}

function render(): void {
  root.replaceChildren(...renderState(panelState));
}

function renderState(state: PanelState): Node[] {
  switch (state.kind) {
    case 'waiting':
      return [message('Waiting for Lean…')];
    case 'unavailable':
      return [message('The Lean 4 extension is not available. See the "Lean Blackboard" output channel.', 'message error')];
    case 'noEditor':
      return [message('Open a Lean file and place the cursor inside a proof.')];
    case 'error':
      return [location(state.location), message(state.message, 'message error')];
    case 'goals': {
      const badge = el('span', `badge ${state.mode}`, state.mode);
      badge.title =
        state.mode === 'precise'
          ? 'Precise mode: LaTeX rendered by the LeanBlackboard Lean package from the real expressions'
          : 'Fast mode: LaTeX converted from the pretty-printed text (import LeanBlackboard for precise mode)';
      const nodes: Node[] = [el('div', 'location', state.location, ' ', badge)];
      if (state.fallbackReason) {
        nodes.push(message(`Showing plain goals (interactive goals failed: ${state.fallbackReason})`, 'message warning'));
      }
      if (state.goals === null) {
        if (!state.termGoal) nodes.push(message('No tactic state at the cursor.'));
      } else if (state.goals.length === 0) {
        nodes.push(message('No goals.', 'message success'));
      } else {
        const n = state.goals.length;
        const copyAll = button('Copy all', 'Copy all goals as LaTeX', () =>
          vscode.postMessage({ type: 'copy', text: goalsToLatexDocument(state.goals, state.termGoal) }),
        );
        nodes.push(el('div', 'heading', el('h2', 'count', n === 1 ? '1 goal' : `${n} goals`), copyAll));
        nodes.push(...state.goals.map((g, i) => renderGoal(g, `g${i}`)));
      }
      if (state.termGoal) {
        nodes.push(el('h2', 'count', 'Expected type'));
        nodes.push(renderGoal(state.termGoal, 'term'));
      }
      return nodes;
    }
  }
}

function location(text: string): HTMLElement {
  return el('div', 'location', text);
}

function renderGoal(goal: GoalView, keyPrefix: string): HTMLElement {
  if (goal.kind === 'plain') return el('section', 'goal', el('pre', 'code', goal.text));

  const section = el('section', diffClass('goal', goal.isInserted, goal.isRemoved));
  if (goal.userName) section.append(el('div', 'case', `case ${goal.userName}`));
  section.append(...goal.hyps.map((h) => renderRow(hypRow(h, keyPrefix))));
  const prefix = goal.prefix.trim() === '⊢' ? '\\vdash' : `\\texttt{${goal.prefix.trim()}}`;
  section.append(
    renderRow({
      key: `${keyPrefix}:goal`,
      latex: `${prefix} ${goal.typeLatex}`,
      lean: `${goal.prefix}${goal.type}`,
      className: 'target',
    }),
  );
  return section;
}

function hypRow(h: HypView, keyPrefix: string): Row {
  let latex = `${h.namesLatex} : ${h.typeLatex}`;
  let lean = `${h.names.join(' ')} : ${h.type}`;
  if (h.val !== undefined && h.valLatex !== undefined) {
    latex += ` \\coloneqq ${h.valLatex}`;
    lean += ` := ${h.val}`;
  }
  return {
    key: `${keyPrefix}:hyp:${h.names.join(' ')}`,
    latex,
    lean,
    className: diffClass('hyp', h.isInserted, h.isRemoved),
  };
}

function diffClass(base: string, inserted: boolean, removed: boolean): string {
  return base + (inserted ? ' inserted' : '') + (removed ? ' removed' : '');
}

window.addEventListener('message', (e: MessageEvent<HostMessage>) => {
  const msg = e.data;
  if (msg?.type === 'state') {
    panelState = msg.state;
  } else if (msg?.type === 'config') {
    // A new global notation resets the per-row choices.
    if (saved.notation !== undefined && saved.notation !== msg.config.notation) overrides = {};
    saved.notation = msg.config.notation;
    config = msg.config;
    persist();
  } else {
    return;
  }
  render();
});

render();
vscode.postMessage({ type: 'ready' });

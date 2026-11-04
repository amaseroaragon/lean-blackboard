// Webview script: renders PanelState with KaTeX. Built with DOM APIs only (no innerHTML), and
// KaTeX's `render` builds DOM nodes with CSSOM styles, so it works under a strict CSP without
// `'unsafe-inline'`.

import type { GoalView, HostMessage, HypView, PanelState, WebviewMessage } from '@lean-blackboard/core';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './panel.css';

declare function acquireVsCodeApi(): { postMessage(msg: WebviewMessage): void };

const vscode = acquireVsCodeApi();
const root = document.getElementById('root') as HTMLElement;

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

/**
 * Renders LaTeX into a block. If KaTeX rejects it (a conversion bug), shows the Lean text
 * instead, so the panel is never empty. The Lean text is also available as a tooltip.
 */
function math(latex: string, leanText: string, className: string): HTMLElement {
  const node = el('div', `math ${className}`);
  node.title = leanText;
  try {
    katex.render(`\\displaystyle ${latex}`, node, {
      throwOnError: true,
      displayMode: false,
      strict: 'ignore',
      trust: false,
      maxExpand: 1000,
      maxSize: 20,
    });
  } catch (e) {
    node.replaceChildren(el('span', 'code fallback', leanText));
    node.title = `KaTeX could not render: ${e instanceof Error ? e.message : String(e)}`;
  }
  return node;
}

function render(state: PanelState): void {
  root.replaceChildren(...renderState(state));
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
      const nodes: Node[] = [location(state.location)];
      if (state.fallbackReason) {
        nodes.push(message(`Showing plain goals (interactive goals failed: ${state.fallbackReason})`, 'message warning'));
      }
      if (state.goals === null) {
        nodes.push(message('No tactic state at the cursor.'));
      } else if (state.goals.length === 0) {
        nodes.push(message('No goals.', 'message success'));
      } else {
        const n = state.goals.length;
        nodes.push(el('h2', 'count', n === 1 ? '1 goal' : `${n} goals`));
        nodes.push(...state.goals.map(renderGoal));
      }
      return nodes;
    }
  }
}

function location(text: string): HTMLElement {
  return el('div', 'location', text);
}

function renderGoal(goal: GoalView): HTMLElement {
  if (goal.kind === 'plain') return el('section', 'goal', el('pre', 'code', goal.text));

  const section = el('section', diffClass('goal', goal.isInserted, goal.isRemoved));
  if (goal.userName) section.append(el('div', 'case', `case ${goal.userName}`));
  section.append(...goal.hyps.map(renderHyp));
  const prefix = goal.prefix.trim() === '⊢' ? '\\vdash' : `\\texttt{${goal.prefix.trim()}}`;
  section.append(math(`${prefix} ${goal.typeLatex}`, `${goal.prefix}${goal.type}`, 'target'));
  return section;
}

function renderHyp(h: HypView): HTMLElement {
  let latex = `${h.namesLatex} : ${h.typeLatex}`;
  let lean = `${h.names.join(' ')} : ${h.type}`;
  if (h.val !== undefined && h.valLatex !== undefined) {
    latex += ` \\coloneqq ${h.valLatex}`;
    lean += ` := ${h.val}`;
  }
  return math(latex, lean, diffClass('hyp', h.isInserted, h.isRemoved));
}

function diffClass(base: string, inserted: boolean, removed: boolean): string {
  return base + (inserted ? ' inserted' : '') + (removed ? ' removed' : '');
}

window.addEventListener('message', (e: MessageEvent<HostMessage>) => {
  if (e.data?.type === 'state') render(e.data.state);
});

render({ kind: 'waiting' });
vscode.postMessage({ type: 'ready' });

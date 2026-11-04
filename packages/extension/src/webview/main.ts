// Webview script: renders PanelState as plain text using DOM APIs only (no innerHTML),
// so Lean output can never be interpreted as markup.

import type { GoalView, HostMessage, HypView, PanelState, WebviewMessage } from '../protocol';

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
  section.append(el('div', 'line target', el('span', 'prefix', goal.prefix), el('span', 'code', goal.type)));
  return section;
}

function renderHyp(h: HypView): HTMLElement {
  const parts: (Node | string)[] = [el('span', 'names', h.names.join(' ')), ' : ', el('span', 'code', h.type)];
  if (h.val !== undefined) parts.push(' := ', el('span', 'code', h.val));
  return el('div', diffClass('line hyp', h.isInserted, h.isRemoved), ...parts);
}

function diffClass(base: string, inserted: boolean, removed: boolean): string {
  return base + (inserted ? ' inserted' : '') + (removed ? ' removed' : '');
}

window.addEventListener('message', (e: MessageEvent<HostMessage>) => {
  if (e.data?.type === 'state') render(e.data.state);
});

render({ kind: 'waiting' });
vscode.postMessage({ type: 'ready' });

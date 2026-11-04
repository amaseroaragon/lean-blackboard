// Webview script: renders PanelState with KaTeX. Built with DOM APIs only (no innerHTML), and
// KaTeX's `render` builds DOM nodes with CSSOM styles, so it works under a strict CSP without
// `'unsafe-inline'`.

import type {
  SubexprView,
  GoalView,
  HostMessage,
  HypView,
  Notation,
  PanelState,
  ViewConfig,
  WebviewMessage,
} from '@lean-blackboard/core';
import { breakLatex, goalsToLatexDocument, stripMarkers } from '@lean-blackboard/core';
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
  target.dataset.latex = latex;
  target.dataset.lean = lean;
  renderKatex(target, latex, lean);
}

function renderKatex(target: HTMLElement, latex: string, lean: string): void {
  try {
    katex.render(`\\displaystyle ${latex}`, target, {
      throwOnError: true,
      displayMode: false,
      strict: 'ignore',
      // Only `\\htmlData` (interactivity markers from the precise mode) is trusted.
      trust: (ctx) => ctx.command === '\\htmlData',
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
    button('Copy', 'Copy LaTeX', () => vscode.postMessage({ type: 'copy', text: stripMarkers(row.latex) })),
  );
  return el('div', `row ${row.className}`, content, actions);
}

/** Deepest line-breaking level tried for formulas wider than the panel. */
const MAX_BREAK_DEPTH = 3;

function render(): void {
  root.replaceChildren(...renderState(panelState));
  fitFormulas();
}

/**
 * Formulas wider than the panel are re-rendered broken into lines, one more level each time,
 * until they fit (or nothing more can be split; then the row scrolls horizontally).
 */
function fitFormulas(): void {
  for (const node of root.querySelectorAll<HTMLElement>('.content[data-latex]')) fitNode(node);
}

/** Re-renders one formula (already in the DOM, with `data-latex`) broken into lines if too wide. */
function fitNode(node: HTMLElement): void {
  const latex = node.dataset.latex ?? '';
  const lean = node.dataset.lean ?? '';
  let previous = latex;
  for (let depth = 1; depth <= MAX_BREAK_DEPTH && node.scrollWidth > node.clientWidth + 1; depth++) {
    const broken = breakLatex(latex, depth);
    if (broken === previous) break;
    renderKatex(node, broken, lean);
    previous = broken;
  }
}

// Re-fit when the panel width changes (not its height, which our own rendering changes).
let lastWidth = root.clientWidth;
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
new ResizeObserver(() => {
  if (root.clientWidth === lastWidth) return;
  lastWidth = root.clientWidth;
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 100);
}).observe(root);

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

// ---------------------------------------------------------------------------
// Interactivity (precise mode): hover a subterm to see its type, Ctrl/Cmd+click to open its
// declaration. Subterms carry `data-lbid` from `\\htmlData{lbid=N}{…}`.
// ---------------------------------------------------------------------------

const tooltip = el('div', 'lb-tooltip hidden');
document.body.append(tooltip);
let hovered: HTMLElement | undefined;
const isMac = navigator.userAgent.includes('Mac');

function subexprOf(node: HTMLElement): SubexprView | undefined {
  const id = Number(node.dataset.lbid);
  return panelState.kind === 'goals' ? panelState.subexprs?.[id] : undefined;
}

function setHovered(node: HTMLElement | undefined, x: number, y: number): void {
  if (node !== hovered) {
    hovered?.classList.remove('lb-hover');
    hovered = node;
    hovered?.classList.add('lb-hover');
  }
  const data = node ? subexprOf(node) : undefined;
  if (!node || !data) {
    tooltip.classList.add('hidden');
    return;
  }
  const formula = el('div', 'lb-tooltip-math');
  const parts: Node[] = [formula];
  if (data.const) {
    const hint = data.location ? ` — ${isMac ? '⌘' : 'Ctrl'}+click to go to definition` : '';
    parts.push(el('div', 'lb-tooltip-hint', `${data.const}${hint}`));
  }
  tooltip.replaceChildren(...parts);
  tooltip.classList.remove('hidden');
  // Rendered once visible, so that long types can be broken to the tooltip's width.
  renderMath(formula, `${data.latex} : ${data.typeLatex}`, `${data.expr} : ${data.type}`);
  fitNode(formula);
  // Below the pointer, kept inside the panel.
  const left = Math.max(4, Math.min(x + 8, window.innerWidth - tooltip.offsetWidth - 4));
  const top = y + 16 + tooltip.offsetHeight > window.innerHeight ? y - tooltip.offsetHeight - 8 : y + 16;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(4, top)}px`;
}

root.addEventListener('mousemove', (e) => {
  const target = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-lbid]') : null;
  setHovered(target ?? undefined, e.clientX, e.clientY);
});
root.addEventListener('mouseleave', () => setHovered(undefined, 0, 0));
root.addEventListener('click', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const target = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-lbid]') : null;
  const location = target ? subexprOf(target)?.location : undefined;
  if (!location) return;
  e.preventDefault();
  vscode.postMessage({ type: 'goto', ...location });
});

window.addEventListener('message', (e: MessageEvent<HostMessage>) => {
  const msg = e.data;
  if (msg?.type === 'state') {
    panelState = msg.state;
    setHovered(undefined, 0, 0);
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

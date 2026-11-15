// Webview script: renders PanelState with KaTeX. Built with DOM APIs only (no innerHTML), and
// KaTeX's `render` builds DOM nodes with CSSOM styles, so it works under a strict CSP without
// `'unsafe-inline'`.

import type {
  DefinitionView,
  GoalView,
  HostMessage,
  HypView,
  MessageView,
  Notation,
  PanelState,
  SimpStepView,
  SubexprView,
  ViewConfig,
  WebviewMessage,
} from '@lean-blackboard/core';
import { breakToFit, definitionsToLatexDocument, goalsToLatexDocument, stripMarkers } from '@lean-blackboard/core';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './panel.css';

type GoalsState = Extract<PanelState, { kind: 'goals' }>;

/** A goal state kept visible while the cursor moves elsewhere. */
interface Pin {
  id: number;
  state: GoalsState;
}

/** Persisted across hide/show of the view (the webview is recreated). */
interface SavedState {
  /** Notation the overrides were made against: they are dropped when the global one changes. */
  notation?: Notation;
  /** Per-row notation that differs from the global one, keyed by row id. */
  overrides?: Record<string, Notation>;
  pins?: Pin[];
  /** Whether the "Before" section is expanded (default: yes). */
  beforeOpen?: boolean;
}

/** Pins kept at most; the oldest is dropped. */
const MAX_PINS = 5;

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
let pins: Pin[] = saved.pins ?? [];
let beforeOpen = saved.beforeOpen ?? true;

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

function renderKatex(target: HTMLElement, latex: string, lean: string, display = true): void {
  try {
    katex.render(display ? `\\displaystyle ${latex}` : latex, target, {
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
  vscode.setState({ notation: config.notation, overrides, pins, beforeOpen });
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


function render(): void {
  let nodes: Node[];
  try {
    nodes = [...renderPins(), ...renderState(panelState)];
  } catch (e) {
    // Never keep showing a stale state silently: say that this one could not be drawn.
    console.error(e);
    const detail = e instanceof Error ? e.message : String(e);
    nodes = [message(`Lean Blackboard could not draw this state (${detail}). Please report it.`, 'message error')];
  }
  root.replaceChildren(...nodes);
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
/**
 * Room kept free when breaking: the `aligned` environment adds column spacing that measuring
 * single lines does not include.
 */
const FIT_MARGIN_PX = 20;

function fitNode(node: HTMLElement): void {
  const available = node.clientWidth;
  if (node.scrollWidth <= available + 1) return;
  const latex = node.dataset.latex ?? '';
  const lean = node.dataset.lean ?? '';
  // Measure candidate lines with the same classes (hence fonts) as the formula itself.
  measurer.className = `${node.className} measurer`;
  // Lines are measured one by one; inside `aligned` they come out slightly wider. Correct with
  // the real result: if it still overflows, try again with the target reduced by the excess.
  let width = available - FIT_MARGIN_PX;
  for (let attempt = 0; attempt < 3 && width > 40; attempt++) {
    const target = width;
    const cache = new Map<string, boolean>();
    const fits = (line: string): boolean => {
      let ok = cache.get(line);
      if (ok === undefined) {
        ok = measureWidth(line) <= target;
        cache.set(line, ok);
      }
      return ok;
    };
    const broken = breakToFit(latex, fits);
    if (broken === latex) return;
    renderKatex(node, broken, lean);
    const excess = node.scrollWidth - available;
    if (excess <= 1) return;
    width -= excess + 4;
  }
}

/** Off-screen element where candidate lines are rendered to measure their width. */
const measurer = el('div', 'measurer');
document.body.append(measurer);

function measureWidth(latex: string): number {
  try {
    katex.render(`\\displaystyle ${latex}`, measurer, {
      throwOnError: true,
      displayMode: false,
      strict: 'ignore',
      trust: (ctx) => ctx.command === '\\htmlData',
      maxExpand: 1000,
      maxSize: 20,
      macros: { ...config.macros },
    });
  } catch {
    return Number.POSITIVE_INFINITY;
  }
  return measurer.scrollWidth;
}

// KaTeX's fonts load asynchronously: widths measured before they arrive are wrong, so draw
// (and fit) again once they are available.
document.fonts?.addEventListener('loadingdone', () => render());
void document.fonts?.ready.then(() => render());

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
      const pin = button('Pin', 'Pin this goal state (keep it visible while moving)', () => pinState(state));
      const nodes: Node[] = [el('div', 'location', state.location, ' ', badge, ' ', pin)];
      if (state.fallbackReason) {
        nodes.push(message(`Showing plain goals (interactive goals failed: ${state.fallbackReason})`, 'message warning'));
      }
      if (state.preciseProblem) nodes.push(message(state.preciseProblem, 'message warning'));
      if (state.simpStep) nodes.push(renderSimpStep(state.simpStep));
      const before = renderBefore(state);
      if (before) nodes.push(before);
      nodes.push(...renderGoalsBody(state, ''));
      if (state.messages && state.messages.length > 0) nodes.push(renderMessages(state.messages));
      // Hover lookups use the state of the closest `data-source` (see `subexprOf`).
      const wrapper = el('div', 'source', ...nodes);
      wrapper.dataset.source = 'current';
      return [wrapper];
    }
  }
}

/**
 * Definitions, goals, "no goals" messages and expected type; `keyPrefix` keeps row keys unique
 * per section.
 */
function renderGoalsBody(state: GoalsState, keyPrefix: string): Node[] {
  const nodes: Node[] = [];
  const defs = state.definitions ?? [];
  if (defs.length > 0) nodes.push(...renderDefinitions(defs, keyPrefix));
  if (state.goals === null) {
    if (!state.termGoal && defs.length === 0) nodes.push(message('No tactic state at the cursor.'));
  } else if (state.goals.length === 0) {
    nodes.push(message('No goals.', 'message success'));
  } else {
    const n = state.goals.length;
    const copyAll = button('Copy all', 'Copy all goals as LaTeX', () =>
      vscode.postMessage({ type: 'copy', text: goalsToLatexDocument(state.goals, state.termGoal) }),
    );
    nodes.push(el('div', 'heading', el('h2', 'count', n === 1 ? '1 goal' : `${n} goals`), copyAll));
    nodes.push(...state.goals.map((g, i) => renderGoal(g, `${keyPrefix}g${i}`)));
  }
  // The expected type often repeats the only goal (e.g. `exact` on the main goal): skip it then.
  const termGoal = state.termGoal;
  const repeatsGoal =
    termGoal !== undefined && termGoal !== null && state.goals?.length === 1 &&
    goalsSignature([termGoal]) === goalsSignature(state.goals);
  if (termGoal && !repeatsGoal) {
    nodes.push(el('h2', 'count', 'Expected type'));
    nodes.push(renderGoal(termGoal, `${keyPrefix}term`));
  }
  return nodes;
}

/**
 * The declarations of the command at the cursor: signature, then one row per defining equation,
 * field or constructor.
 */
function renderDefinitions(defs: DefinitionView[], keyPrefix: string): Node[] {
  const copy = button('Copy', 'Copy the definition as LaTeX', () =>
    vscode.postMessage({ type: 'copy', text: definitionsToLatexDocument(defs) }),
  );
  const kindTitle = { def: 'Definition', structure: 'Structure', inductive: 'Inductive type' } as const;
  const first = defs[0];
  const title = defs.length === 1 && first ? kindTitle[first.kind] : `Definitions (${defs.length})`;
  const nodes: Node[] = [el('div', 'heading', el('h2', 'count', title), copy)];
  defs.forEach((d, i) => {
    const key = `${keyPrefix}d${i}:${d.name}`;
    const section = el('section', 'goal definition');
    section.append(
      renderRow({ key: `${key}:sig`, latex: `${d.nameLatex} : ${d.typeLatex}`, lean: `${d.name} : ${d.type}`, className: 'signature' }),
      ...d.equations.map((e, j) => renderRow({ key: `${key}:eq${j}`, latex: e.latex, lean: e.lean, className: 'equation' })),
      ...d.members.map((m, j) =>
        renderRow({ key: `${key}:m${j}`, latex: `${m.nameLatex} : ${m.typeLatex}`, lean: `${m.name} : ${m.type}`, className: 'member' }),
      ),
    );
    nodes.push(section);
  });
  return nodes;
}

/** Same goals with markers removed: used to hide "Before" when nothing changed. */
function goalsSignature(goals: GoalView[] | null | undefined): string {
  return JSON.stringify(
    (goals ?? []).map((g) =>
      g.kind === 'plain' ? g.text : [stripMarkers(g.typeLatex), g.hyps.map((h) => [h.names, stripMarkers(h.typeLatex)])],
    ),
  );
}

/** Note shown with the cursor inside a simp lemma list: which part of the list the goals reflect. */
function renderSimpStep(step: SimpStepView): HTMLElement {
  const note = el('div', 'simp-step', `Lemma list: first ${step.applied} of ${step.total} applied`);
  note.title =
    'State after running the tactic with only the list items before the cursor; Before has one less. ' +
    'simp uses all its lemmas at once, so this is what each lemma adds, not a trace of the full simp.';
  return note;
}

/**
 * Collapsible "Before" section: the goals at the start of the line (before this step) or, inside
 * a simp lemma list, the state without the last lemma before the cursor.
 */
function renderBefore(state: GoalsState): HTMLElement | undefined {
  const before = state.goalsBefore;
  if (!before || goalsSignature(before) === goalsSignature(state.goals)) return undefined;
  const details = el('details', 'before');
  details.open = beforeOpen;
  details.addEventListener('toggle', () => {
    beforeOpen = details.open;
    persist();
  });
  const n = before.length;
  const summary = el('summary', 'count', `Before (${n === 0 ? 'no goals' : n === 1 ? '1 goal' : `${n} goals`})`);
  details.append(summary, ...before.map((g, i) => renderGoal(g, `b${i}`)));
  return details;
}

function renderMessages(messages: MessageView[]): HTMLElement {
  const section = el('section', 'messages', el('h2', 'count', messages.length === 1 ? 'Message' : `Messages (${messages.length})`));
  messages.forEach((m, i) => {
    const header = el('button', `msg-line ${m.severity}`, `${m.severity} · line ${m.line + 1}`);
    header.type = 'button';
    header.title = 'Show in the editor';
    header.addEventListener('click', () => vscode.postMessage({ type: 'reveal', line: m.line }));
    const body = el('div', 'msg-body');
    m.parts.forEach((p, j) => {
      if (p.kind === 'text') {
        body.append(el('span', 'msg-text', p.text));
      } else if (p.kind === 'expr') {
        const span = el('span', 'msg-expr');
        if (notationOf(`m${i}e${j}`) === 'math') renderKatex(span, p.latex, p.lean, false);
        else span.append(el('span', 'code', p.lean));
        body.append(span);
      } else {
        body.append(renderGoal(p.goal, `m${i}g${j}`));
      }
    });
    section.append(el('div', `msg ${m.severity}`, header, body));
  });
  return section;
}

function pinState(state: GoalsState): void {
  const id = (pins.reduce((m, p) => Math.max(m, p.id), 0) || 0) + 1;
  pins = [...pins, { id, state }].slice(-MAX_PINS);
  persist();
  render();
}

function unpin(id: number): void {
  pins = pins.filter((p) => p.id !== id);
  persist();
  render();
}

function renderPins(): Node[] {
  return pins.map((p) => {
    const close = button('Unpin', 'Unpin this goal state', () => unpin(p.id));
    const header = el('div', 'pin-header', el('span', 'pin-title', `📌 ${p.state.location}`), close);
    const body = el('div', 'pin-body', ...renderGoalsBody(p.state, `p${p.id}`));
    const node = el('section', 'pin', header, body);
    node.dataset.source = `pin:${p.id}`;
    return node;
  });
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
  const source = node.closest<HTMLElement>('[data-source]')?.dataset.source;
  if (source?.startsWith('pin:')) {
    return pins.find((p) => `pin:${p.id}` === source)?.state.subexprs?.[id];
  }
  return panelState.kind === 'goals' ? panelState.subexprs?.[id] : undefined;
}

function setHovered(node: HTMLElement | undefined, x: number, y: number): void {
  // The tooltip's content only changes with the hovered subterm; moving inside it just moves it.
  if (node !== hovered) {
    hovered?.classList.remove('lb-hover');
    hovered = node;
    hovered?.classList.add('lb-hover');
    const data = node ? subexprOf(node) : undefined;
    if (!data) {
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
  }
  if (!node || tooltip.classList.contains('hidden')) return;
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
  } else if (msg?.type === 'pin') {
    if (panelState.kind === 'goals') pinState(panelState);
    return;
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

// Line breaking for long formulas. KaTeX barely breaks lines, and the panel is narrow, so long
// goals are split at top-level operators into an `aligned` environment.
//
// Works on the LaTeX produced by our renderers, which always surround binary operators with
// spaces (`#1 \to #2`) and separate binders from their body with `,\ `.

/**
 * Operator classes from loosest to tightest binding; a split uses the loosest present.
 * `trailing`: the operator stays at the end of the line (commas) instead of starting the next.
 * `binder`: binder heads (`\forall x > 0,`) are never split themselves.
 */
const CLASSES: { ops: string[]; binder?: boolean; trailing?: boolean }[] = [
  { ops: [',\\ '], binder: true, trailing: true },
  // Argument separators. Only at the top level when splitting inside `\left( … \right)`.
  { ops: [', '], trailing: true },
  { ops: [' \\iff '] },
  { ops: [' \\Rightarrow ', ' \\to ', ' \\mapsto '] },
  { ops: [' \\lor '] },
  { ops: [' \\land '] },
  {
    ops: [
      ' = ', ' \\neq ', ' < ', ' > ', ' \\leq ', ' \\geq ', ' \\in ', ' \\notin ', ' \\subseteq ',
      ' \\subset ', ' \\subsetneq ', ' \\mid ', ' \\approx ',
    ],
  },
  { ops: [' + ', ' - '] },
  { ops: [' \\cdot ', ' \\times '] },
];

import { findMarkers, removeMarkers } from './markers';
import type { Marker } from './markers';

interface Split {
  parts: string[];
  /** `ops[i]` separates `parts[i]` and `parts[i + 1]`. */
  ops: string[];
  binder: boolean;
  trailing: boolean;
}

/**
 * Positions at nesting depth 0 (outside `{}`, `\left…\right` and `\begin…\end`). The given
 * interactivity markers are transparent: their header is skipped and their braces do not nest.
 */
function topLevelMask(latex: string, transparent: Marker[] = []): boolean[] {
  const top: boolean[] = new Array(latex.length).fill(false);
  const starts = new Map(transparent.map((m) => [m.start, m.contentStart]));
  const closes = new Set(transparent.map((m) => m.close));
  let depth = 0;
  let i = 0;
  while (i < latex.length) {
    const contentStart = starts.get(i);
    if (contentStart !== undefined) {
      i = contentStart;
      continue;
    }
    if (closes.has(i)) {
      i++;
      continue;
    }
    const rest = latex.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^\\(left|right)(\\[A-Za-z]+|\\.|.)/))) {
      // The `\\left` token itself is "top level" if the group it opens is.
      if (m[1] === 'left') top[i] = depth === 0;
      depth += m[1] === 'left' ? 1 : -1;
      i += m[0].length;
      continue;
    }
    if ((m = rest.match(/^\\(begin|end)\{[^}]*\}/))) {
      depth += m[1] === 'begin' ? 1 : -1;
      i += m[0].length;
      continue;
    }
    if (rest.startsWith('\\{') || rest.startsWith('\\}') || rest.startsWith('\\\\')) {
      top[i] = top[i + 1] = depth === 0;
      i += 2;
      continue;
    }
    const c = latex[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else top[i] = depth === 0;
    i++;
  }
  return top;
}

/** Start indices of the loosest class's operators at the top level (empty if none). */
function splitPoints(latex: string, top: boolean[]): number[] {
  for (const cls of CLASSES) {
    const points: number[] = [];
    let start = 0;
    let i = 0;
    while (i < latex.length) {
      const op = top[i] ? cls.ops.find((o) => latex.startsWith(o, i) && top[i + o.length - 1]) : undefined;
      if (op !== undefined && latex.slice(start, i).trim() !== '') {
        points.push(i);
        i += op.length;
        start = i;
      } else {
        i++;
      }
    }
    if (points.length > 0) return points;
  }
  return [];
}

/**
 * Removes the interactivity markers that a split would cut through (those containing a split
 * point once markers are treated as transparent). Inner subterms keep their markers.
 */
function dropCrossingMarkers(latex: string): string {
  const markers = findMarkers(latex);
  if (markers.length === 0) return latex;
  const points = splitPoints(latex, topLevelMask(latex, markers));
  const crossing = markers.filter((m) => points.some((p) => p >= m.contentStart && p < m.close));
  return crossing.length === 0 ? latex : removeMarkers(latex, crossing);
}

/** Splits at the loosest operator class present at the top level, or `undefined`. */
export function splitTopLevel(input: string): Split | undefined {
  const latex = dropCrossingMarkers(input);
  const top = topLevelMask(latex);
  for (const cls of CLASSES) {
    const parts: string[] = [];
    const ops: string[] = [];
    let start = 0;
    let i = 0;
    while (i < latex.length) {
      const op = top[i] ? cls.ops.find((o) => latex.startsWith(o, i) && top[i + o.length - 1]) : undefined;
      // A leading operator (`- x`) is not a split point.
      if (op !== undefined && latex.slice(start, i).trim() !== '') {
        parts.push(latex.slice(start, i));
        ops.push(op.trim());
        i += op.length;
        start = i;
      } else {
        i++;
      }
    }
    if (parts.length > 0) {
      parts.push(latex.slice(start));
      return { parts, ops, binder: cls.binder === true, trailing: cls.trailing === true };
    }
  }
  return undefined;
}

interface Line {
  indent: number;
  text: string;
}

interface ParenGroup {
  /** Index of `\\left(`. */
  start: number;
  innerStart: number;
  /** Index of the matching `\\right)`. */
  innerEnd: number;
  /** Index just after `\\right)`. */
  end: number;
}

/** `\\left` / `\\right` as delimiter commands (not `\\leftarrow`, `\\rightarrow`…). */
const isLeft = (s: string, i: number) => s.startsWith('\\left', i) && !/[A-Za-z]/.test(s[i + 5] ?? '');
const isRight = (s: string, i: number) => s.startsWith('\\right', i) && !/[A-Za-z]/.test(s[i + 6] ?? '');

/** The widest top-level `\\left( … \\right)` group (markers are transparent), if any. */
function topLevelParenGroup(latex: string): ParenGroup | undefined {
  let best: ParenGroup | undefined;
  for (const group of topLevelParenGroups(latex)) {
    if (!best || group.end - group.start > best.end - best.start) best = group;
  }
  return best;
}

/** All top-level `\\left( … \\right)` groups, left to right (markers are transparent). */
function topLevelParenGroups(latex: string): ParenGroup[] {
  const top = topLevelMask(latex, findMarkers(latex));
  const groups: ParenGroup[] = [];
  for (let i = 0; i < latex.length; i++) {
    if (!top[i] || !latex.startsWith('\\left(', i)) continue;
    let depth = 0;
    let j = i;
    while (j < latex.length) {
      if (isLeft(latex, j)) {
        depth++;
        j += 5;
      } else if (isRight(latex, j)) {
        depth--;
        if (depth === 0) break;
        j += 6;
      } else {
        j++;
      }
    }
    if (depth !== 0 || !latex.startsWith('\\right)', j)) continue;
    groups.push({ start: i, innerStart: i + 6, innerEnd: j, end: j + 7 });
    i = j;
  }
  return groups;
}

/**
 * When nothing can be split at the top level, splits inside the widest parenthesised group:
 * `\\left( a + \\right.` / `\\left. b \\right)` (each line balances its own delimiters).
 * Markers enclosing the group would span lines, so they are dropped.
 */
function breakInsideParens(input: string, depth: number, indent: number): Line[] | undefined {
  let latex = input;
  let group = topLevelParenGroup(latex);
  if (!group) return undefined;
  const g0 = group;
  const enclosing = findMarkers(latex).filter((m) => m.start < g0.start && m.close >= g0.end);
  if (enclosing.length > 0) {
    latex = removeMarkers(latex, enclosing);
    group = topLevelParenGroup(latex);
    if (!group) return undefined;
  }
  const inner = breakLines(unwrapBraces(latex.slice(group.innerStart, group.innerEnd)), depth - 1, indent + 1);
  if (inner.length < 2) return undefined;
  const before = latex.slice(0, group.start);
  const after = latex.slice(group.end);
  const last = inner.length - 1;
  return inner.map((l, k) => {
    const open = k === 0 ? `${before}\\left(` : '\\left.';
    const close = k === last ? `\\right)${after}` : '\\right.';
    return { indent: k === 0 ? indent : l.indent, text: `${open} ${l.text} ${close}`.trim() };
  });
}

function breakLines(latex: string, depth: number, indent: number): Line[] {
  const split = depth > 0 ? splitTopLevel(latex) : undefined;
  if (!split) {
    const inParens = depth > 0 ? breakInsideParens(latex, depth, indent) : undefined;
    return inParens ?? [{ indent, text: latex.trim() }];
  }
  const lines: Line[] = [];
  split.parts.forEach((part, i) => {
    if (split.binder) {
      // Binder heads (`\forall x > 0,`) stay whole; the body goes one level deeper.
      const isHead = i < split.parts.length - 1;
      if (isHead) lines.push({ indent: i === 0 ? indent : indent + 1, text: `${part.trim()},` });
      else lines.push(...breakLines(part, depth - 1, indent + 1));
    } else if (split.trailing) {
      const text = i < split.parts.length - 1 ? `${part.trim()},` : part;
      lines.push(...breakLines(text, depth - 1, i === 0 ? indent : indent + 1));
    } else {
      const text = i === 0 ? part : `${split.ops[i - 1]} ${part.trim()}`;
      lines.push(...breakLines(text, depth - 1, i === 0 ? indent : indent + 1));
    }
  });
  return lines;
}

/**
 * Breaks `latex` into lines, splitting recursively up to `depth` levels. Returns `latex`
 * unchanged if there is nothing to split.
 */
export function breakLatex(latex: string, depth: number): string {
  const lines = breakLines(latex, depth, 0);
  if (lines.length < 2) return latex;
  const body = lines.map((l) => `& ${'\\quad '.repeat(l.indent)}${l.text}`).join(' \\\\\n');
  return `\\begin{aligned}\n${body}\n\\end{aligned}`;
}

// ---------------------------------------------------------------------------
// Width-driven breaking: split only what does not fit, and pack each line as full as possible.
// ---------------------------------------------------------------------------

/** Deepest nesting of splits tried (a guard; widths normally stop it much earlier). */
const MAX_FIT_LEVEL = 12;

const lineLatex = (l: Line) => `${'\\quad '.repeat(l.indent)}${l.text}`;

/**
 * Breaks `latex` into as few lines as possible so that each satisfies `fits` (typically "its
 * rendered width is at most the panel's"). Splits at the loosest top-level operator, packs
 * consecutive pieces greedily, recurses only into pieces that still do not fit, and splits inside
 * `\left( … \right)` when nothing else is left. Returns `latex` unchanged if it already fits or
 * cannot be split.
 */
export function breakToFit(latex: string, fits: (line: string) => boolean): string {
  if (fits(latex)) return latex;
  const lines = fitLines(latex, 0, fits, 0);
  if (lines.length < 2) return latex;
  const body = lines.map((l) => `& ${lineLatex(l)}`).join(' \\\\\n');
  return `\\begin{aligned}\n${body}\n\\end{aligned}`;
}

function fitLines(input: string, indent: number, fits: (line: string) => boolean, level: number): Line[] {
  const text = input.trim();
  const whole: Line = { indent, text };
  if (level > MAX_FIT_LEVEL || fits(lineLatex(whole))) return [whole];
  const split = splitTopLevel(text);
  if (!split) return fitInsideParens(text, indent, fits, level) ?? [whole];

  const n = split.parts.length;
  const segments = split.parts.map((p, i) => {
    if (split.trailing) return i < n - 1 ? `${p.trim()},` : p.trim();
    return i === 0 ? p.trim() : `${split.ops[i - 1]} ${p.trim()}`;
  });
  const out: Line[] = [];
  let current = segments[0];
  let currentIndent = indent;
  let runHasLast = n === 1;
  const flush = () => {
    // Binder heads stay whole; anything else that still does not fit is split further.
    if (split.binder && !runHasLast) out.push({ indent: currentIndent, text: current });
    else out.push(...fitLines(current, currentIndent, fits, level + 1));
  };
  for (let i = 1; i < n; i++) {
    const joined = `${current} ${segments[i]}`;
    if (fits(lineLatex({ indent: currentIndent, text: joined }))) {
      current = joined;
    } else {
      flush();
      current = segments[i];
      currentIndent = indent + 1;
    }
    runHasLast = i === n - 1;
  }
  flush();
  return out;
}

/**
 * `before \left( inner \right) after`, with `inner` broken to fit (as in `breakInsideParens`).
 * Tries the top-level groups from right to left (breaking late keeps more on the first line)
 * and uses the first whose content can actually be split.
 */
function fitInsideParens(
  input: string,
  indent: number,
  fits: (line: string) => boolean,
  level: number,
): Line[] | undefined {
  const count = topLevelParenGroups(input).length;
  for (let k = count - 1; k >= 0; k--) {
    const lines = fitInsideGroup(input, k, indent, fits, level);
    if (lines) return lines;
  }
  return undefined;
}

function fitInsideGroup(
  input: string,
  index: number,
  indent: number,
  fits: (line: string) => boolean,
  level: number,
): Line[] | undefined {
  let latex = input;
  let group = topLevelParenGroups(latex)[index];
  if (!group) return undefined;
  const g0 = group;
  const enclosing = findMarkers(latex).filter((m) => m.start < g0.start && m.close >= g0.end);
  if (enclosing.length > 0) {
    latex = removeMarkers(latex, enclosing);
    group = topLevelParenGroups(latex)[index];
    if (!group) return undefined;
  }
  const innerText = unwrapBraces(latex.slice(group.innerStart, group.innerEnd));
  let inner = fitLines(innerText, indent + 1, fits, level + 1);
  if (inner.length < 2) {
    // The content fits on its own line, but not together with what surrounds the group: still
    // split it at its loosest operator, so that the group can start on this line.
    inner = forcedSplit(innerText, indent + 1, fits, level);
    if (inner.length < 2) return undefined;
  }
  const before = latex.slice(0, group.start);
  const after = latex.slice(group.end);
  const last = inner.length - 1;
  return inner.map((l, k) => {
    const open = k === 0 ? `${before}\\left(` : '\\left.';
    const close = k === last ? `\\right)${after}` : '\\right.';
    return { indent: k === 0 ? indent : l.indent, text: `${open} ${l.text} ${close}`.trim() };
  });
}

/**
 * `{x + y}` → `x + y` when one brace pair wraps everything (group slots such as `\left({#1}\right)`
 * add them), so that the content can be split.
 */
function unwrapBraces(input: string): string {
  const s = input.trim();
  if (!s.startsWith('{') || !s.endsWith('}')) return input;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') {
      i++;
      continue;
    }
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0 && i < s.length - 1) return input; // closes early
  }
  return depth === 0 ? s.slice(1, -1) : input;
}

/** One split of `text` at its loosest top-level operator, the rest packed as in `fitLines`. */
function forcedSplit(text: string, indent: number, fits: (line: string) => boolean, level: number): Line[] {
  const split = splitTopLevel(text);
  if (!split) return [{ indent, text: text.trim() }];
  const n = split.parts.length;
  const first = split.trailing ? `${split.parts[0].trim()},` : split.parts[0].trim();
  // Everything after the first piece goes on the next line(s), re-joined with its operators.
  const rest = split.parts
    .slice(1)
    .map((p, i) => (split.trailing ? (i < n - 2 ? `${p.trim()},` : p.trim()) : `${split.ops[i]} ${p.trim()}`))
    .join(' ');
  return [{ indent, text: first }, ...fitLines(rest, indent, fits, level + 1)];
}

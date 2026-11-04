// Line breaking for long formulas. KaTeX barely breaks lines, and the panel is narrow, so long
// goals are split at top-level operators into an `aligned` environment.
//
// Works on the LaTeX produced by our renderers, which always surround binary operators with
// spaces (`#1 \to #2`) and separate binders from their body with `,\ `.

/** Operator classes from loosest to tightest binding; a split uses the loosest present. */
const CLASSES: { ops: string[]; binder?: boolean }[] = [
  { ops: [',\\ '], binder: true },
  { ops: [' \\iff '] },
  { ops: [' \\Rightarrow ', ' \\to '] },
  { ops: [' \\lor '] },
  { ops: [' \\land '] },
  {
    ops: [
      ' = ', ' \\neq ', ' < ', ' > ', ' \\leq ', ' \\geq ', ' \\in ', ' \\notin ', ' \\subseteq ',
      ' \\subset ', ' \\subsetneq ', ' \\mid ', ' \\approx ',
    ],
  },
  { ops: [' + ', ' - '] },
];

import { findMarkers, removeMarkers } from './markers';
import type { Marker } from './markers';

interface Split {
  parts: string[];
  /** `ops[i]` separates `parts[i]` and `parts[i + 1]`. */
  ops: string[];
  binder: boolean;
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
      return { parts, ops, binder: cls.binder === true };
    }
  }
  return undefined;
}

interface Line {
  indent: number;
  text: string;
}

function breakLines(latex: string, depth: number, indent: number): Line[] {
  const split = depth > 0 ? splitTopLevel(latex) : undefined;
  if (!split) return [{ indent, text: latex.trim() }];
  const lines: Line[] = [];
  split.parts.forEach((part, i) => {
    if (split.binder) {
      // Binder heads (`\forall x > 0,`) stay whole; the body goes one level deeper.
      const isHead = i < split.parts.length - 1;
      if (isHead) lines.push({ indent: i === 0 ? indent : indent + 1, text: `${part.trim()},` });
      else lines.push(...breakLines(part, depth - 1, indent + 1));
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

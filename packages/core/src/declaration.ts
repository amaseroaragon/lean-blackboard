// Fast mode: the `def` / `structure` / `inductive` at the cursor, read from the source text.
// Precise mode uses the elaborated declaration instead (see `lean/LeanBlackboard/Definition.lean`).
// Only common shapes are understood; anything else is shown in Lean syntax, never hidden.

import { leanToLatex } from './convert';
import type { DefinitionKind, DefinitionView, GoalView } from './protocol';
import { identToLatex } from './render/ident';
import { texttt } from './render/latex';
import type { Rules } from './rules/types';

/** Read access to a document's lines (so callers need not split the whole text). */
export interface SourceLines {
  lineCount: number;
  lineAt(line: number): string;
}

export interface SourceDeclaration {
  kind: DefinitionKind;
  /** As written (`fact`, `Foo.bar`). */
  name: string;
  /** Position of the name (0-based), to ask Lean for the elaborated type. */
  nameLine: number;
  nameCharacter: number;
  /** Header as written (`(x : Nat) : Nat`), shown when the type is not available. */
  header: string;
  /** `def`: Lean text of each defining equation (`fact (n + 1) = (n + 1) * fact n`). */
  equations: string[];
  /** `structure`: fields; `inductive`: constructors. */
  members: { name: string; type: string }[];
}

const MODIFIERS = '(?:(?:private|protected|noncomputable|partial|unsafe|nonrec|scoped)\\s+)*';
const HEAD = new RegExp(
  `^(?:@\\[[^\\]]*\\]\\s*)?${MODIFIERS}(def|abbrev|structure|class\\s+inductive|class|inductive)\\s+([^\\s(\\[{:⦃]+)`,
);
/** Clauses after a definition's body that are not part of it. */
const TRAILER = /^\s*(termination_by|decreasing_by|where|deriving)\b/;
const IDENT = /^[^\s()[\]{}⟨⟩,:]+$/;

/** The declaration containing `line`, if it is a `def`/`abbrev`/`structure`/`inductive`. */
export function findSourceDeclaration(src: SourceLines, line: number): SourceDeclaration | undefined {
  if (line < 0 || line >= src.lineCount) return undefined;
  // Commands start at column 0: walk up to the first such line, which must be the declaration.
  let start = line;
  while (start >= 0 && !startsCommand(src.lineAt(start))) start--;
  if (start < 0) return undefined;
  const head = HEAD.exec(src.lineAt(start));
  if (!head) return undefined;
  let end = start + 1;
  while (end < src.lineCount && !startsCommand(src.lineAt(end))) end++;

  const lines: string[] = [];
  for (let i = start; i < end; i++) lines.push(stripComment(src.lineAt(i)));
  const keyword = head[1] ?? '';
  const name = head[2] ?? '';
  const nameCharacter = (head.index ?? 0) + head[0].length - name.length;
  // Text after the name, keeping line breaks (cases start lines).
  const rest = [lines[0]?.slice(nameCharacter + name.length) ?? '', ...lines.slice(1)].join('\n');
  const base = { name, nameLine: start, nameCharacter, equations: [], members: [] };

  if (keyword === 'structure' || keyword === 'class') {
    const [header, body] = splitAtWord(rest, 'where');
    return { ...base, kind: 'structure', header: oneLine(header), members: structureFields(body ?? '') };
  }
  if (keyword.endsWith('inductive')) {
    const [header, body] = splitCases(rest);
    return { ...base, kind: 'inductive', header: oneLine(header.replace(/\s*where\s*$/, '')), members: constructors(body, name) };
  }
  const [header, body] = splitBody(rest);
  return { ...base, kind: 'def', header: oneLine(header), equations: equations(name, header, body) };
}

function startsCommand(line: string): boolean {
  return line.length > 0 && !/^\s/.test(line) && !line.startsWith('--');
}

/** Drops a `--` comment (Lean has no `--` inside identifiers or operators). */
function stripComment(line: string): string {
  const i = line.indexOf('--');
  return i < 0 ? line : line.slice(0, i);
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

const OPEN = '([{⟨⦃';
const CLOSE = ')]}⟩⦄';

/** Calls `visit(i, depth)` for each character; stops early when it returns `true`. */
function scan(s: string, visit: (i: number, depth: number) => boolean | undefined | void): void {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i] ?? '';
    if (CLOSE.includes(c)) depth = Math.max(0, depth - 1);
    if (visit(i, depth) === true) return;
    if (OPEN.includes(c)) depth++;
  }
}

/** Splits at the first top-level occurrence of `token` (`[s]` if there is none). */
function splitTop(s: string, token: string, isBoundary = (_i: number) => true): [string, string?] {
  let at = -1;
  scan(s, (i, depth) => {
    if (depth === 0 && s.startsWith(token, i) && isBoundary(i)) {
      at = i;
      return true;
    }
    return false;
  });
  return at < 0 ? [s] : [s.slice(0, at), s.slice(at + token.length)];
}

/** All top-level parts separated by `token`. */
function splitAllTop(s: string, token: string, isBoundary = (_i: number) => true): string[] {
  const parts: string[] = [];
  let last = 0;
  scan(s, (i, depth) => {
    if (depth === 0 && i >= last && s.startsWith(token, i) && isBoundary(i)) {
      parts.push(s.slice(last, i));
      last = i + token.length;
    }
  });
  parts.push(s.slice(last));
  return parts;
}

const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}_'.!?]/u.test(c);

function splitAtWord(s: string, word: string): [string, string?] {
  return splitTop(s, word, (i) => !isWordChar(s[i - 1]) && !isWordChar(s[i + word.length]));
}

/** `|` that starts a line (pattern-matching case or constructor). */
function isCaseBar(s: string, i: number): boolean {
  const before = s.slice(s.lastIndexOf('\n', i - 1) + 1, i);
  return before.trim() === '' && s[i + 1] !== '|';
}

/** Header and the cases after it (`| …`), for definitions by pattern matching and inductives. */
function splitCases(s: string): [string, string[]] {
  const parts = splitAllTop(s, '|', (i) => isCaseBar(s, i));
  return [parts[0] ?? '', parts.slice(1)];
}

/** Header, and either `:= body` or the `| …` cases. */
function splitBody(s: string): [string, string | string[]] {
  const [beforeAssign, assigned] = splitTop(s, ':=');
  const [header, cases] = splitCases(beforeAssign);
  if (cases.length > 0) return [header, cases.map(dropTrailer)];
  return [beforeAssign, dropTrailer(assigned ?? '')];
}

function dropTrailer(s: string): string {
  const lines = s.split('\n');
  const i = lines.findIndex((l, k) => k > 0 && TRAILER.test(l));
  return (i < 0 ? lines : lines.slice(0, i)).join('\n');
}

/** Names of the explicit binders of a header (`(a b : T)`, or bare `x` before the `:`). */
function explicitBinders(header: string): string[] {
  const [binders] = splitTop(header, ':');
  const names: string[] = [];
  let group: { open: string; from: number } | undefined;
  let bare = '';
  const flushBare = () => {
    for (const w of bare.trim().split(/\s+/)) if (w !== '' && IDENT.test(w)) names.push(w);
    bare = '';
  };
  scan(binders, (i, depth) => {
    const c = binders[i] ?? '';
    if (depth === 0 && OPEN.includes(c)) {
      flushBare();
      group = { open: c, from: i + 1 };
    } else if (depth === 0 && CLOSE.includes(c) && group) {
      // Only explicit `( … )` groups are arguments; `{…}`, `[…]`, `⦃…⦄` are not.
      if (group.open === '(') {
        const [ns] = splitTop(binders.slice(group.from, i), ':');
        names.push(...ns.trim().split(/\s+/).filter((n) => IDENT.test(n)));
      }
      group = undefined;
    } else if (depth === 0 && !group) {
      bare += c;
    }
  });
  flushBare();
  return names;
}

/** An argument as it reads after the function name: `0`, `n`, `(n + 1)`. */
function arg(s: string): string {
  const t = oneLine(s);
  return IDENT.test(t) || /^[([⟨].*[)\]⟩]$/.test(t) ? t : `(${t})`;
}

function equations(name: string, header: string, body: string | string[]): string[] {
  const params = explicitBinders(header);
  const eq = (args: string[], rhs: string) => {
    const lhs = args.length > 0 ? `${name} ${args.map(arg).join(' ')}` : name;
    return `${lhs} = ${oneLine(rhs)}`;
  };
  if (Array.isArray(body)) {
    // `| p₁, p₂ => rhs`: the patterns follow the explicit parameters.
    return body.flatMap((c) => {
      const [pats, rhs] = splitTop(c, '=>');
      if (rhs === undefined) return [];
      return [eq([...params, ...splitAllTop(pats, ',').map(wildcard)], rhs)];
    });
  }
  const text = body.trim();
  if (text === '' || /^by\b/.test(text)) return [];
  // `match a, b with | … => …` on parameters: one equation per case, as with `|` cases.
  const m = /^match\s+([\s\S]*?)\s+with\b([\s\S]*)$/.exec(text);
  if (m) {
    const scrutinees = (m[1] ?? '').split(',').map((x) => x.trim());
    const [, cases] = splitCases(m[2] ?? '');
    if (cases.length > 0 && scrutinees.every((x) => params.includes(x))) {
      return cases.flatMap((c) => {
        const [pats, rhs] = splitTop(c, '=>');
        if (rhs === undefined) return [];
        const ps = splitAllTop(pats, ',').map(wildcard);
        return [eq(params.map((p) => ps[scrutinees.indexOf(p)] ?? p), rhs)];
      });
    }
  }
  return [eq(params, text)];
}

/** `_` patterns read as a variable. */
function wildcard(p: string): string {
  return p.trim() === '_' ? 'x' : p;
}

/** `name : T` lines after `where` (continuation lines are more indented). */
function structureFields(body: string): { name: string; type: string }[] {
  const items: string[] = [];
  let indent = -1;
  for (const raw of body.split('\n')) {
    if (raw.trim() === '') continue;
    const ind = raw.search(/\S/);
    if (indent < 0) indent = ind;
    if (ind <= indent || items.length === 0) items.push(raw.trim());
    else items[items.length - 1] += ` ${raw.trim()}`;
  }
  return items.flatMap((item) => {
    if (/^\S+\s*::$/.test(item) || TRAILER.test(item)) return []; // `mk ::`, `deriving …`
    const group = /^\(([^:]+):(.*)\)$/.exec(item);
    const [names, type] = group ? [group[1] ?? '', group[2] ?? ''] : splitTop(item, ':');
    if (type === undefined) return [];
    const ty = oneLine(splitTop(type, ':=')[0]);
    return names.trim().split(/\s+/).filter((n) => IDENT.test(n)).map((n) => ({ name: n, type: ty }));
  });
}

/** `| c (n : ℕ) : T` constructors; without a type, the constructor has the inductive type. */
function constructors(cases: string[], typeName: string): { name: string; type: string }[] {
  return cases.flatMap((c) => {
    const text = oneLine(dropTrailer(c));
    const m = /^(\S+)\s*(.*)$/.exec(text);
    if (!m || m[1] === undefined) return [];
    const [binders, type] = splitTop(m[2] ?? '', ':');
    const ty = type === undefined ? typeName : oneLine(type);
    return [{ name: m[1], type: binders.trim() === '' ? ty : `∀ ${binders.trim()}, ${ty}` }];
  });
}

/**
 * The view of a source declaration. `signature` is Lean's type for the name (the expected type at
 * its position); without it, the header is shown as written.
 */
export function sourceDeclarationToView(d: SourceDeclaration, signature: GoalView | undefined, rules: Rules): DefinitionView {
  const typed = signature?.kind === 'structured' ? signature : undefined;
  return {
    kind: d.kind,
    name: d.name,
    nameLatex: identToLatex(d.name, rules.symbols),
    type: typed?.type ?? d.header,
    typeLatex: typed?.typeLatex ?? texttt(d.header),
    equations: d.equations.map((e) => ({ lean: e, latex: leanToLatex(e, rules) })),
    members: d.members.map((m) => ({
      name: m.name,
      nameLatex: identToLatex(m.name, rules.symbols),
      type: m.type,
      typeLatex: leanToLatex(m.type, rules),
    })),
  };
}

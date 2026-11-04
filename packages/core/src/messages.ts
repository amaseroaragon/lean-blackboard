// Interactive diagnostics (`Lean.Widget.getInteractiveDiagnostics`) → message view model.
// Message text is `TaggedText<MsgEmbed>`; with `hasWidgets` (set by the official client) every
// piece is wrapped in an embed: `{ expr: CodeWithInfos }`, `{ goal: InteractiveGoal }`,
// `{ widget: { wi, alt } }` or `{ trace: { msg, children, … } }`.

import { taggedTextToLatex } from './convert';
import { interactiveGoalsToView } from './goals';
import type { MessagePart, MessageView, Severity } from './protocol';
import { defaultRules } from './rules/defaultRules';
import type { Rules } from './rules/types';
import { flattenTaggedText } from './taggedText';

const SEVERITIES: Record<number, Severity> = { 1: 'error', 2: 'warning', 3: 'information', 4: 'hint' };

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** An expression worth rendering as maths: code with at least one subexpression tag. */
function isTaggedCode(code: unknown): boolean {
  return isObj(code) && 'tag' in code;
}

/**
 * The root `SubexprInfo.info` reference of a tagged expression (what the precise mode needs to
 * render it from the real `Expr`), or `undefined`.
 */
function rootInfoRef(code: unknown): unknown {
  if (!isObj(code) || !Array.isArray(code.tag)) return undefined;
  const info = code.tag[0];
  return isObj(info) ? info.info : undefined;
}

interface Walk {
  parts: MessagePart[];
  /** Root info references of the `expr` parts, in order (for the precise mode). */
  refs: unknown[];
}

function pushText(w: Walk, text: string): void {
  if (text === '') return;
  const last = w.parts[w.parts.length - 1];
  if (last?.kind === 'text') last.text += text;
  else w.parts.push({ kind: 'text', text });
}

function walk(node: unknown, w: Walk, rules: Rules): void {
  if (!isObj(node)) return;
  if (typeof node.text === 'string') {
    pushText(w, node.text);
  } else if (Array.isArray(node.append)) {
    for (const child of node.append) walk(child, w, rules);
  } else if (Array.isArray(node.tag)) {
    const embed = node.tag[0];
    if (!isObj(embed)) return;
    if ('expr' in embed) {
      if (isTaggedCode(embed.expr)) {
        w.parts.push({ kind: 'expr', latex: taggedTextToLatex(embed.expr, rules), lean: flattenTaggedText(embed.expr) });
        w.refs.push(rootInfoRef(embed.expr));
      } else {
        pushText(w, flattenTaggedText(embed.expr));
      }
    } else if ('goal' in embed) {
      const [goal] = interactiveGoalsToView({ goals: [embed.goal] }, rules) ?? [];
      if (goal) w.parts.push({ kind: 'goal', goal });
    } else if (isObj(embed.widget)) {
      walk(embed.widget.alt, w, rules);
    } else if (isObj(embed.trace)) {
      walk(embed.trace.msg, w, rules);
      const children = embed.trace.children;
      if (isObj(children) && Array.isArray(children.strict)) {
        for (const c of children.strict) {
          pushText(w, '\n');
          walk(c, w, rules);
        }
      }
    }
  }
}

export interface MessagesResult {
  messages: MessageView[];
  /** Root info references of all `expr` parts, in document order (may contain `undefined`). */
  exprRefs: unknown[];
}

/** Converts a `getInteractiveDiagnostics` response. Unknown shapes are skipped, never thrown. */
export function interactiveDiagnosticsToView(res: unknown, rules: Rules = defaultRules): MessagesResult {
  const messages: MessageView[] = [];
  const exprRefs: unknown[] = [];
  if (!Array.isArray(res)) return { messages, exprRefs };
  for (const d of res) {
    if (!isObj(d)) continue;
    const w: Walk = { parts: [], refs: [] };
    walk(d.message, w, rules);
    // Trim the trailing newline Lean leaves after the last embed.
    const last = w.parts[w.parts.length - 1];
    if (last?.kind === 'text') last.text = last.text.replace(/\s+$/, '');
    const range = isObj(d.range) && isObj(d.range.start) ? d.range.start : undefined;
    messages.push({
      severity: SEVERITIES[Number(d.severity)] ?? 'information',
      line: typeof range?.line === 'number' ? range.line : 0,
      parts: w.parts.filter((p) => p.kind !== 'text' || p.text !== ''),
    });
    exprRefs.push(...w.refs);
  }
  return { messages, exprRefs };
}

/**
 * Replaces the LaTeX of `expr` parts with the precise mode's rendering (one entry per expr part,
 * in order; empty strings keep the fast-mode LaTeX).
 */
export function applyPreciseExprs(messages: MessageView[], latex: string[]): void {
  let i = 0;
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.kind !== 'expr') continue;
      const precise = latex[i++];
      if (precise) p.latex = precise;
    }
  }
}

// Public conversion entry points. Never throw and never return an empty result: anything that
// cannot be converted is shown in Lean syntax with `\texttt{}`.

import { parseTerm } from './parser/parser';
import { LatexRenderer, texttt } from './render/latex';
import { defaultRules } from './rules/defaultRules';
import type { Rules } from './rules/types';
import { flattenTaggedText } from './taggedText';

/** Converts Lean term text. Falls back to `\texttt{text}` as a whole. */
export function leanToLatex(text: string, rules: Rules = defaultRules): string {
  return tryConvert(text, rules) ?? texttt(text);
}

/**
 * Converts a `TaggedText` from the server. If the whole expression cannot be converted, each
 * tagged subexpression is converted on its own and only the unconvertible glue text is shown as
 * `\texttt{}`, so one unsupported construct does not hide the maths around it.
 */
export function taggedTextToLatex(tt: unknown, rules: Rules = defaultRules): string {
  const whole = tryConvert(flattenTaggedText(tt), rules);
  if (whole !== undefined) return whole;
  if (typeof tt !== 'object' || tt === null) return texttt('');
  if ('tag' in tt && Array.isArray(tt.tag)) return taggedTextToLatex(tt.tag[1], rules);
  if ('append' in tt && Array.isArray(tt.append)) {
    return tt.append
      .map((part: unknown) => {
        if (typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string') {
          return texttt(part.text);
        }
        return taggedTextToLatex(part, rules);
      })
      .join('');
  }
  return texttt(flattenTaggedText(tt));
}

function tryConvert(text: string, rules: Rules): string | undefined {
  if (text.trim() === '') return undefined;
  try {
    return new LatexRenderer(rules).render(parseTerm(text));
  } catch {
    // ParseError or an unexpected renderer failure: the caller falls back.
    return undefined;
  }
}

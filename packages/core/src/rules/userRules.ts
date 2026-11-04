// Merges user rules (`leanBlackboard.customRules`) over a base rule set.
// User input is untrusted configuration: every invalid entry is skipped with a warning,
// never thrown, so a typo cannot break the panel.

import { BINDERS, INFIX, POSTFIX, PREFIX } from '../parser/syntax';
import type { Rules } from './types';

export interface MergeResult {
  rules: Rules;
  warnings: string[];
}

const SECTIONS = ['symbols', 'infix', 'prefix', 'postfix', 'functions', 'binders'] as const;
type Section = (typeof SECTIONS)[number];

/** Highest `#n` placeholder used in a template (0 if none). */
export function templateArity(template: string): number {
  let max = 0;
  for (const m of template.matchAll(/#(\d)/g)) max = Math.max(max, Number(m[1]));
  return max;
}

export function mergeUserRules(base: Rules, input: unknown): MergeResult {
  const rules: Rules = {
    symbols: { ...base.symbols },
    infix: { ...base.infix },
    prefix: { ...base.prefix },
    postfix: { ...base.postfix },
    functions: { ...base.functions },
    binders: { ...base.binders },
  };
  const warnings: string[] = [];

  if (input === undefined || input === null) return { rules, warnings };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { rules, warnings: ['customRules must be an object; ignored.'] };
  }

  for (const [section, entries] of Object.entries(input)) {
    if (!(SECTIONS as readonly string[]).includes(section)) {
      warnings.push(`customRules.${section}: unknown section (expected one of ${SECTIONS.join(', ')}); ignored.`);
      continue;
    }
    if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) {
      warnings.push(`customRules.${section} must be an object of "key": "template"; ignored.`);
      continue;
    }
    for (const [key, template] of Object.entries(entries as Record<string, unknown>)) {
      const where = `customRules.${section}["${key}"]`;
      if (typeof template !== 'string') {
        warnings.push(`${where}: template must be a string; ignored.`);
        continue;
      }
      const error = validate(section as Section, key, template);
      if (error) {
        warnings.push(`${where}: ${error}; ignored.`);
        continue;
      }
      if (section === 'functions') {
        const arity = templateArity(template);
        if (arity === 0) {
          // A template without arguments is a symbol: `Real.pi` → `\pi`.
          rules.symbols[key] = template;
        } else {
          rules.functions[key] = { arity, template };
        }
      } else {
        rules[section as Exclude<Section, 'functions'>][key] = template;
      }
    }
  }
  return { rules, warnings };
}

function validate(section: Section, key: string, template: string): string | undefined {
  const arity = templateArity(template);
  switch (section) {
    case 'symbols':
      return arity > 0 ? 'symbols cannot use #n placeholders (use "functions")' : undefined;
    case 'infix':
      if (!(key in INFIX)) return `"${key}" is not an infix operator the parser knows`;
      return arity > 2 ? 'infix templates only have #1 and #2' : undefined;
    case 'prefix':
      if (!(key in PREFIX)) return `"${key}" is not a prefix operator the parser knows`;
      return arity > 1 ? 'prefix templates only have #1' : undefined;
    case 'postfix':
      if (!POSTFIX.has(key)) return `"${key}" is not a postfix operator the parser knows`;
      return arity > 1 ? 'postfix templates only have #1' : undefined;
    case 'binders':
      if (!(key in BINDERS) || key === 'fun' || key === 'λ') return `"${key}" is not a supported binder`;
      return arity > 0 ? 'binder templates are a plain command such as \\forall' : undefined;
    case 'functions':
      return /^[^\s()]+$/u.test(key) ? undefined : 'function names cannot contain spaces or parentheses';
  }
}

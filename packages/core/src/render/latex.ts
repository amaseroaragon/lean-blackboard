// AST → LaTeX using a rule set.

import type { BinderGroup, Term } from '../parser/ast';
import type { Rules } from '../rules/types';
import { escapeMath, identToLatex } from './ident';

/** `\texttt{…}` with LaTeX text-mode escaping. Used for anything we cannot convert. */
export function texttt(text: string): string {
  const escaped = text.replace(/\s+/g, ' ').replace(/[\\{}#$%&_^~]/g, (c) => {
    switch (c) {
      case '\\':
        return '\\textbackslash{}';
      case '^':
        return '\\textasciicircum{}';
      case '~':
        return '\\textasciitilde{}';
      default:
        return `\\${c}`;
    }
  });
  // KaTeX rejects many Unicode math symbols in text mode (`∫`, `∑`…): switch to math for them.
  const safe = escaped.replace(/[^\p{L}\p{N}\p{ASCII}]/gu, (c) => `$${c}$`);
  return `\\texttt{${safe}}`;
}

/**
 * Templates ending in a closing delimiter (`\sqrt{…}`, `\left|…\right|`, `\binom{…}{…}`) are
 * self-delimiting. Same rule as `closesWithDelimiter` in `lean/LeanBlackboard/Latex.lean`.
 */
export function closesWithDelimiter(template: string): boolean {
  return /(\}|\\right(\)|\]|\||\\\||\\rangle)|\\rfloor|\\rceil|\\rangle)\s*$/.test(template);
}

/** `Finset.range`, also printed as `range` under `open Finset`. */
const RANGE_NAMES = new Set(['Finset.range', 'range']);
const TENDSTO_NAMES = new Set(['Filter.Tendsto', 'Tendsto']);
const AT_TOP_NAMES = new Set(['Filter.atTop', 'atTop']);

/** Number sets: binders over them read `x \in \mathbb{N}` instead of `x : \mathbb{N}`. */
const SET_LIKE_HEADS = new Set(['Set', 'Finset', 'Fin']);

export class LatexRenderer {
  constructor(private readonly rules: Rules) {}

  render(t: Term): string {
    switch (t.k) {
      case 'ident': {
        // `z.re` with no arguments: a unary function rule in field notation.
        const field = this.rules.functions[t.name] ? undefined : this.fieldRule(t.name);
        if (field && field.rule.arity === 1) return this.applyRule(field.rule, [field.obj]);
        return this.renderIdent(t.name, false);
      }
      case 'num':
        return t.text;
      case 'str':
        return texttt(t.text);
      case 'paren': {
        const inner = t.inner.k === 'ascription' ? t.inner.term : t.inner;
        // `(2 : ℝ)` → `2`: the ascription is dropped, and so are parens around atoms.
        if (t.inner.k === 'ascription' && isAtomic(inner)) return this.render(inner);
        return `\\left(${this.render(inner)}\\right)`;
      }
      case 'ascription':
        return this.render(t.term);
      case 'app':
        return this.renderApp(t.fn, t.args);
      case 'field':
        return `${this.render(t.obj)}.${identToLatex(t.name, {})}`;
      case 'binop': {
        // `a ^ 2` where `a` renders without closing delimiter (`\sin x`) needs explicit parens.
        const lhs = t.op === '^' ? this.protectBase(t.lhs) : t.lhs;
        // A negated operand on the right reads better parenthesised: `a \cdot (-b)`.
        const rhs = t.rhs.k === 'prefix' && t.rhs.op === '-' ? `\\left(${this.render(t.rhs)}\\right)` : t.rhs;
        return this.fill(this.rules.infix[t.op] ?? `#1 \\mathbin{${escapeMath(t.op)}} #2`, [lhs, rhs]);
      }
      case 'prefix': {
        if ((t.op === '¬' || t.op === '!') && t.arg.k === 'binop') {
          return `\\neg\\left(${this.render(t.arg)}\\right)`;
        }
        return this.fill(this.rules.prefix[t.op] ?? `${escapeMath(t.op)}#1`, [t.arg]);
      }
      case 'postfix':
        return this.fill(this.rules.postfix[t.op] ?? `#1${escapeMath(t.op)}`, [this.protectBase(t.arg)]);
      case 'binder':
        return this.renderBinder(t.q, t.groups, t.body);
      case 'delim':
        return this.renderDelim(t.open, this.render(strip(t.inner)));
      case 'seq': {
        if (t.items.length === 0) return t.open === '(' ? '()' : `${delimLeft(t.open)}${delimRight(t.close)}`;
        const items = t.items.map((i) => this.render(strip(i))).join(', ');
        return `\\left${delimLeft(t.open)}${items}\\right${delimRight(t.close)}`;
      }
      case 'setOf': {
        const head = identToLatex(t.name, this.rules.symbols) + (t.type ? this.typeSuffix(t.type) : '');
        return `\\left\\{ ${head} \\mid ${this.render(t.body)} \\right\\}`;
      }
    }
  }

  /**
   * Fills `#n` placeholders. `{#n}` is a group slot: source-only parentheses are dropped.
   * Arguments may be pre-rendered strings.
   */
  private fill(template: string, args: (Term | string)[]): string {
    return template.replace(/\{#(\d)\}|#(\d)/g, (_m, grouped: string | undefined, plain: string | undefined) => {
      const arg = args[Number(grouped ?? plain) - 1];
      if (arg === undefined) return '';
      if (typeof arg === 'string') return grouped ? `{${arg}}` : arg;
      return grouped ? `{${this.render(strip(arg))}}` : this.render(arg);
    });
  }

  /**
   * Field notation on a variable (`n.choose 2`, `z.re`) resolved against the function rules: if
   * exactly one template matches `*.choose`, render it with the object as first argument.
   */
  private fieldRule(name: string): { obj: Term; rule: { arity: number; template: string } } | undefined {
    const segments = name.split('.');
    if (segments.length !== 2 || !/^\p{Ll}/u.test(segments[0]) || /^\d+$/.test(segments[1])) return undefined;
    const suffix = `.${segments[1]}`;
    const matches = Object.entries(this.rules.functions).filter(([k]) => k.endsWith(suffix));
    const templates = new Set(matches.map(([, r]) => `${r.arity}:${r.template}`));
    if (templates.size !== 1) return undefined;
    return { obj: { k: 'ident', name: segments[0] }, rule: matches[0][1] };
  }

  private renderApp(fn: Term, args: Term[]): string {
    if (fn.k === 'ident') {
      const special = this.renderSpecial(fn.name, args);
      if (special !== undefined) return special;
      const rule = this.rules.functions[fn.name];
      if (rule && args.length >= rule.arity) return this.applyRule(rule, args);
      if (!rule) {
        const field = this.fieldRule(fn.name);
        if (field && args.length + 1 >= field.rule.arity) return this.applyRule(field.rule, [field.obj, ...args]);
      }
      return this.renderIdent(fn.name, true) + this.argList(args);
    }
    return this.render(fn) + this.argList(args);
  }

  /** Notations that need structure, not just a template: derivatives and limits. */
  private renderSpecial(name: string, args: Term[]): string | undefined {
    if (name === 'deriv' && args.length === 2) {
      const f = strip(args[0]);
      if (f.k !== 'binder' || f.q !== 'fun') return undefined;
      const vars = f.groups.flatMap((g) => g.names);
      if (vars.length !== 1) return undefined;
      const v = identToLatex(vars[0], this.rules.symbols);
      const body = `\\frac{d}{d${v}}\\left(${this.render(f.body)}\\right)`;
      const at = strip(args[1]);
      if (at.k === 'ident' && at.name === vars[0]) return body;
      return `\\left.${body}\\right|_{${v} = ${this.render(at)}}`;
    }
    if (TENDSTO_NAMES.has(name) && args.length === 3) {
      const source = this.limitTarget(args[1]);
      const target = this.limitTarget(args[2]);
      if (!source || !target) return undefined;
      const f = strip(args[0]);
      let v = 'x';
      let value: string;
      if (f.k === 'binder' && f.q === 'fun' && f.groups.flatMap((g) => g.names).length === 1) {
        v = identToLatex(f.groups[0].names[0], this.rules.symbols);
        value = this.render(f.body);
      } else {
        value = `${this.render(f)}\\left(${v}\\right)`;
      }
      return `\\lim_{${v} \\to ${source}} ${value} = ${target}`;
    }
    return undefined;
  }

  /** `atTop` → `\infty`, `nhds a` → `a`; anything else is not a simple limit. */
  private limitTarget(t: Term): string | undefined {
    const s = strip(t);
    if (s.k === 'ident' && AT_TOP_NAMES.has(s.name)) return '\\infty';
    if (s.k === 'app' && s.fn.k === 'ident' && s.fn.name === 'nhds' && s.args.length === 1) {
      return this.render(strip(s.args[0]));
    }
    return undefined;
  }

  private applyRule(rule: { arity: number; template: string }, args: Term[]): string {
    const applied = this.fill(rule.template, args.slice(0, rule.arity));
    const rest = args.slice(rule.arity);
    return rest.length === 0 ? applied : `${applied}${this.argList(rest)}`;
  }

  /**
   * Field notation on a variable (`l.length`, `n.succ`) renders as `l.\\mathrm{length}`.
   * Capitalised first segments are namespaces (`Nat.succ`) and stay a single name.
   */
  private renderIdent(name: string, head: boolean): string {
    if (this.rules.symbols[name] !== undefined) return this.rules.symbols[name];
    const segments = name.split('.');
    if (segments.length > 1 && /^\p{Ll}/u.test(segments[0]) && !/^\d+$/.test(segments[1])) {
      const fields = segments.slice(1).map((f, i) => identToLatex(f, {}, head && i === segments.length - 2));
      return [identToLatex(segments[0], this.rules.symbols), ...fields].join('.');
    }
    return identToLatex(name, this.rules.symbols, head);
  }

  /** Parenthesises an operand of `^`/postfix if it is a function rule application (`\\sin x`). */
  private protectBase(t: Term): Term | string {
    // The rule applied to `t`, if any; self-delimiting templates (`\sqrt{…}`, `\left|…\right|`)
    // need no parentheses.
    const ruleFor = (n: string) => this.rules.functions[n] ?? this.fieldRule(n)?.rule;
    const rule =
      t.k === 'app' && t.fn.k === 'ident' ? ruleFor(t.fn.name) : t.k === 'ident' ? this.fieldRule(t.name)?.rule : undefined;
    if (rule && !closesWithDelimiter(rule.template)) return `\\left(${this.render(t)}\\right)`;
    return t;
  }

  private argList(args: Term[]): string {
    return `\\left(${args.map((a) => this.render(strip(a))).join(', ')}\\right)`;
  }

  private renderDelim(open: string, inner: string): string {
    switch (open) {
      case '|':
        return `\\left|${inner}\\right|`;
      case '‖':
        return `\\left\\|${inner}\\right\\|`;
      case '⌊':
        return `\\left\\lfloor ${inner}\\right\\rfloor`;
      default:
        return `\\left\\lceil ${inner}\\right\\rceil`;
    }
  }

  private renderBinder(q: string, allGroups: BinderGroup[], body: Term): string {
    // Instance binders (`[inst : Foo α]`) are implicit in ordinary mathematics.
    const groups = allGroups.filter((g) => g.bracket !== '[');
    const bodyLatex = this.render(body);

    if (q === 'fun') {
      const names = groups.flatMap((g) => g.names).map((n) => identToLatex(n, this.rules.symbols));
      const params = names.length === 1 ? names[0] : `\\left(${names.join(', ')}\\right)`;
      return `${params} \\mapsto ${bodyLatex}`;
    }

    const head = this.rules.binders[q] ?? escapeMath(q);
    if (q === '∑' || q === '∏') {
      const range = this.rangeBounds(groups);
      if (range) return `${head}_{${range.lower}}^{${range.upper}} ${bodyLatex}`;
      return `${head}_{${groups.map((g) => this.groupLatex(g)).join(', ')}} ${bodyLatex}`;
    }
    if (groups.length === 0) return bodyLatex;
    return `${groups.map((g) => `${head} ${this.groupLatex(g)}`).join(',\\ ')},\\ ${bodyLatex}`;
  }

  /** `∑ i ∈ Finset.range n, f i` → lower `i=0`, upper `n-1`. */
  private rangeBounds(groups: BinderGroup[]): { lower: string; upper: string } | undefined {
    if (groups.length !== 1) return undefined;
    const g = groups[0];
    const rhs = g.pred?.rhs;
    if (g.names.length !== 1 || g.pred?.op !== '∈' || !rhs || rhs.k !== 'app') return undefined;
    if (rhs.fn.k !== 'ident' || !RANGE_NAMES.has(rhs.fn.name) || rhs.args.length !== 1) return undefined;
    const n = strip(rhs.args[0]);
    const upper =
      n.k === 'binop' && n.op === '+' && n.rhs.k === 'num' && n.rhs.text === '1'
        ? this.render(n.lhs)
        : n.k === 'num'
          ? String(Number(n.text) - 1)
          : `${this.render(n)} - 1`;
    return { lower: `${identToLatex(g.names[0], this.rules.symbols)}=0`, upper };
  }

  private groupLatex(g: BinderGroup): string {
    const names = g.names.map((n) => identToLatex(n, this.rules.symbols)).join(', ');
    if (g.pred) return this.fill(this.rules.infix[g.pred.op] ?? `#1 \\mathbin{${escapeMath(g.pred.op)}} #2`, [names, g.pred.rhs]);
    if (g.type) return names ? names + this.typeSuffix(g.type) : this.render(g.type);
    return names;
  }

  private typeSuffix(type: Term): string {
    return isSetLike(type, this.rules) ? ` \\in ${this.render(type)}` : ` : ${this.render(type)}`;
  }
}

function isSetLike(t: Term, rules: Rules): boolean {
  if (t.k === 'ident') return (rules.symbols[t.name] ?? '').startsWith('\\mathbb');
  return t.k === 'app' && t.fn.k === 'ident' && SET_LIKE_HEADS.has(t.fn.name);
}

/** Removes parentheses (and ascriptions) that only existed for Lean's own precedence. */
function strip(t: Term): Term {
  let cur = t;
  for (;;) {
    if (cur.k === 'paren') cur = cur.inner;
    else if (cur.k === 'ascription') cur = cur.term;
    else return cur;
  }
}

function isAtomic(t: Term): boolean {
  return t.k === 'ident' || t.k === 'num' || t.k === 'str';
}

function delimLeft(open: string): string {
  return { '(': '(', '⟨': '\\langle ', '[': '[', '{': '\\{' }[open] ?? open;
}

function delimRight(close: string): string {
  return { ')': ')', '⟩': '\\rangle ', ']': ']', '}': '\\}' }[close] ?? close;
}

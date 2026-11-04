// Pratt parser for pretty-printed Lean 4 terms. Throws `ParseError` on anything outside the
// supported subset; callers fall back to showing Lean syntax.

import type { BinderGroup, Term } from './ast';
import { ParseError, Token, tokenize } from './lexer';
import {
  ARG_PREC,
  ARG_PREFIX,
  BINDER_PREDICATES,
  BINDERS,
  INFIX,
  MAX_PREC,
  POSTFIX,
  PREFIX,
  UNSUPPORTED_KEYWORDS,
} from './syntax';

const CLOSING: Record<string, string> = { '(': ')', '{': '}', '[': ']', '⦃': '⦄', '⟨': '⟩' };

export function parseTerm(input: string): Term {
  return new Parser(tokenize(input)).parseAll();
}

class Parser {
  private pos = 0;
  /** > 0 while `|` cannot start a term (inside `|…|` or a set-builder head). */
  private barBlocked = 0;
  private normBlocked = 0;

  constructor(private readonly tokens: Token[]) {}

  parseAll(): Term {
    const t = this.parseExpr(0);
    if (this.peek().kind !== 'eof') throw new ParseError(`Unexpected '${this.peek().text}'`);
    return t;
  }

  // -- token helpers ---------------------------------------------------------

  private peek(k = 0): Token {
    return this.tokens[Math.min(this.pos + k, this.tokens.length - 1)];
  }

  private next(): Token {
    const t = this.peek();
    if (t.kind !== 'eof') this.pos++;
    return t;
  }

  private isOp(text: string, k = 0): boolean {
    const t = this.peek(k);
    return t.kind === 'op' && t.text === text;
  }

  private expectOp(text: string): void {
    if (!this.isOp(text)) throw new ParseError(`Expected '${text}', found '${this.peek().text || 'end'}'`);
    this.pos++;
  }

  private expectIdent(): string {
    const t = this.next();
    if (t.kind !== 'ident' || UNSUPPORTED_KEYWORDS.has(t.text)) throw new ParseError(`Expected identifier, found '${t.text}'`);
    return t.text;
  }

  // -- expressions -----------------------------------------------------------

  private parseExpr(minPrec: number): Term {
    let [left, leftPrec] = this.parseLeading();
    for (;;) {
      const t = this.peek();
      if (t.kind === 'op' && t.text in INFIX) {
        const syn = INFIX[t.text];
        const lhsMin = syn.assoc === 'right' ? syn.prec + 1 : syn.assoc === 'left' ? syn.prec : syn.prec + 1;
        if (syn.prec < minPrec || leftPrec < lhsMin) break;
        this.pos++;
        const rhsPrec = syn.assoc === 'right' ? syn.prec : syn.prec + 1;
        const rhs = this.parseExpr(rhsPrec);
        left = { k: 'binop', op: syn.canonical ?? t.text, lhs: left, rhs };
        leftPrec = syn.prec;
        continue;
      }
      if (ARG_PREC >= minPrec && isApplicable(left) && this.startsArgument()) {
        const args: Term[] = [];
        while (this.startsArgument()) args.push(this.parseArgument());
        left = left.k === 'app' ? { k: 'app', fn: left.fn, args: [...left.args, ...args] } : { k: 'app', fn: left, args };
        leftPrec = ARG_PREC;
        continue;
      }
      break;
    }
    return left;
  }

  /** Leading term with its precedence. */
  private parseLeading(): [Term, number] {
    const t = this.peek();
    if (t.kind === 'op' && t.text in PREFIX) {
      this.pos++;
      const syn = PREFIX[t.text];
      return [{ k: 'prefix', op: t.text, arg: this.parseExpr(syn.argPrec) }, syn.prec];
    }
    const binderKey = t.kind === 'op' || t.kind === 'ident' ? t.text : '';
    if (binderKey in BINDERS && (t.kind === 'op' || binderKey === 'fun')) {
      this.pos++;
      return [this.parseBinder(binderKey), BINDERS[binderKey].prec];
    }
    return [this.parseArgument(), MAX_PREC];
  }

  /** Can the next token begin a function argument? */
  private startsArgument(): boolean {
    const t = this.peek();
    if (t.kind === 'ident') return !UNSUPPORTED_KEYWORDS.has(t.text) && t.text !== 'fun';
    if (t.kind === 'num' || t.kind === 'str') return true;
    if (t.kind !== 'op') return false;
    if (t.text === '|') return this.barBlocked === 0;
    if (t.text === '‖') return this.normBlocked === 0;
    return ['(', '⟨', '[', '{', '⌊', '⌈'].includes(t.text) || ARG_PREFIX.has(t.text);
  }

  /** Argument-level term: primary plus postfix operators and field projections. */
  private parseArgument(): Term {
    const t = this.peek();
    if (t.kind === 'op' && ARG_PREFIX.has(t.text)) {
      this.pos++;
      return { k: 'prefix', op: t.text, arg: this.parseExpr(PREFIX[t.text].argPrec) };
    }
    let term = this.parsePrimary();
    for (;;) {
      const p = this.peek();
      if (p.kind === 'op' && POSTFIX.has(p.text)) {
        this.pos++;
        term = { k: 'postfix', op: p.text, arg: term };
      } else if (this.isOp('.') && this.peek(1).kind === 'ident') {
        this.pos++;
        term = { k: 'field', obj: term, name: this.expectIdent() };
      } else {
        return term;
      }
    }
  }

  private parsePrimary(): Term {
    const t = this.next();
    switch (t.kind) {
      case 'ident':
        if (UNSUPPORTED_KEYWORDS.has(t.text) || t.text === 'fun') throw new ParseError(`Unsupported '${t.text}'`);
        return { k: 'ident', name: t.text };
      case 'num':
        return { k: 'num', text: t.text };
      case 'str':
        return { k: 'str', text: t.text };
      case 'eof':
        throw new ParseError('Unexpected end of input');
      case 'op':
        break;
    }
    switch (t.text) {
      case '(':
        return this.parseParen();
      case '⟨':
        return { k: 'seq', open: '⟨', close: '⟩', items: this.parseItems('⟩') };
      case '[':
        return { k: 'seq', open: '[', close: ']', items: this.parseItems(']') };
      case '{':
        return this.parseBrace();
      case '|':
        return this.parseDelim('|', '|');
      case '‖':
        return this.parseDelim('‖', '‖');
      case '⌊':
        return this.parseDelim('⌊', '⌋');
      case '⌈':
        return this.parseDelim('⌈', '⌉');
    }
    throw new ParseError(`Unexpected '${t.text}'`);
  }

  private parseParen(): Term {
    if (this.isOp(')')) {
      this.pos++;
      return { k: 'seq', open: '(', close: ')', items: [] };
    }
    const first = this.parseExpr(0);
    if (this.isOp(':')) {
      this.pos++;
      const type = this.parseExpr(0);
      this.expectOp(')');
      return { k: 'paren', inner: { k: 'ascription', term: first, type } };
    }
    if (this.isOp(',')) {
      const items = [first];
      while (this.isOp(',')) {
        this.pos++;
        items.push(this.parseExpr(0));
      }
      this.expectOp(')');
      return { k: 'seq', open: '(', close: ')', items };
    }
    this.expectOp(')');
    return { k: 'paren', inner: first };
  }

  private parseItems(close: string): Term[] {
    const items: Term[] = [];
    if (this.isOp(close)) {
      this.pos++;
      return items;
    }
    for (;;) {
      items.push(this.parseExpr(0));
      if (this.isOp(',')) {
        this.pos++;
        continue;
      }
      this.expectOp(close);
      return items;
    }
  }

  /** `{x | p}`, `{x : T | p}`, `{x // p}` or a set literal `{a, b}`. */
  private parseBrace(): Term {
    if (this.peek().kind === 'ident') {
      const sep1 = this.peek(1);
      if (sep1.kind === 'op' && (sep1.text === '|' || sep1.text === '//')) {
        const name = this.expectIdent();
        this.pos++;
        const body = this.parseExpr(0);
        this.expectOp('}');
        return { k: 'setOf', name, body };
      }
      if (sep1.kind === 'op' && sep1.text === ':') {
        const save = this.pos;
        const name = this.expectIdent();
        this.pos++;
        this.barBlocked++;
        let type: Term;
        try {
          type = this.parseExpr(0);
        } finally {
          this.barBlocked--;
        }
        if (this.isOp('|') || this.isOp('//')) {
          this.pos++;
          const body = this.parseExpr(0);
          this.expectOp('}');
          return { k: 'setOf', name, type, body };
        }
        this.pos = save;
      }
    }
    return { k: 'seq', open: '{', close: '}', items: this.parseItems('}') };
  }

  private parseDelim(open: string, close: string): Term {
    if (open === '|') this.barBlocked++;
    if (open === '‖') this.normBlocked++;
    try {
      const inner = this.parseExpr(0);
      this.expectOp(close);
      return { k: 'delim', open, close, inner };
    } finally {
      if (open === '|') this.barBlocked--;
      if (open === '‖') this.normBlocked--;
    }
  }

  // -- binders ---------------------------------------------------------------

  private parseBinder(q: string): Term {
    const syn = BINDERS[q];
    const groups: BinderGroup[] = [];
    while (!syn.separators.some((s) => this.isOp(s))) {
      const t = this.peek();
      if (t.kind === 'op' && t.text in CLOSING) {
        this.pos++;
        groups.push(this.parseBracketedGroup(t.text));
      } else if (t.kind === 'ident') {
        groups.push(this.parseBareGroup());
      } else {
        throw new ParseError(`Unexpected '${t.text}' in binder`);
      }
    }
    if (groups.length === 0) throw new ParseError('Binder without variables');
    this.pos++; // separator
    const body = this.parseExpr(syn.bodyPrec);
    return { k: 'binder', q: canonicalBinder(q), groups, body };
  }

  /** `(x y : T)`, `{x : T}`, `⦃x : T⦄`, `[inst : C α]`, `[C α]`. */
  private parseBracketedGroup(open: string): BinderGroup {
    const close = CLOSING[open];
    const save = this.pos;
    const names: string[] = [];
    while (this.peek().kind === 'ident' && !UNSUPPORTED_KEYWORDS.has(this.peek().text)) names.push(this.next().text);
    if (names.length > 0 && this.isOp(':')) {
      this.pos++;
      const type = this.parseExpr(0);
      this.expectOp(close);
      return { names, type, bracket: open };
    }
    if (open !== '[') throw new ParseError('Expected typed binder');
    this.pos = save;
    const type = this.parseExpr(0);
    this.expectOp(close);
    return { names: [], type, bracket: open };
  }

  /** `x y`, `x : T`, `x ∈ s`, `x > 0`. */
  private parseBareGroup(): BinderGroup {
    const names: string[] = [];
    while (this.peek().kind === 'ident') names.push(this.expectIdent());
    if (this.isOp(':')) {
      this.pos++;
      return { names, type: this.parseExpr(0), bracket: '' };
    }
    const t = this.peek();
    if (t.kind === 'op' && BINDER_PREDICATES.has(t.text)) {
      this.pos++;
      return { names, pred: { op: t.text, rhs: this.parseExpr(51) }, bracket: '' };
    }
    return { names, bracket: '' };
  }
}

function canonicalBinder(q: string): string {
  return q === 'λ' ? 'fun' : q;
}

function isApplicable(t: Term): boolean {
  return t.k === 'ident' || t.k === 'paren' || t.k === 'app' || t.k === 'field';
}

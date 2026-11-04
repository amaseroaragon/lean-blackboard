// Golden tests: `test/golden/*.golden` pairs of Lean input → expected LaTeX.
// Every expected output must also be accepted by KaTeX.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { leanToLatex } from '../src';

const GOLDEN_DIR = join(__dirname, '../../../test/golden');

interface Case {
  lean: string;
  tex: string;
  line: number;
}

function load(file: string): Case[] {
  const cases: Case[] = [];
  let pending: { lean: string; line: number } | undefined;
  readFileSync(join(GOLDEN_DIR, file), 'utf8')
    .split('\n')
    .forEach((raw, i) => {
      if (raw.startsWith('lean: ')) pending = { lean: raw.slice(6), line: i + 1 };
      else if (raw.startsWith('tex: ') && pending) {
        cases.push({ ...pending, tex: raw.slice(5) });
        pending = undefined;
      }
    });
  return cases;
}

for (const file of readdirSync(GOLDEN_DIR).filter((f) => f.endsWith('.golden'))) {
  describe(file, () => {
    for (const c of load(file)) {
      it(`${c.lean}  (line ${c.line})`, () => {
        expect(leanToLatex(c.lean)).toBe(c.tex);
        expect(() => katex.renderToString(c.tex, { throwOnError: true, strict: 'ignore' })).not.toThrow();
      });
    }
  });
}

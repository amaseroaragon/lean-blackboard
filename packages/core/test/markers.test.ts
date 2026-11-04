import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { breakLatex, splitTopLevel, stripMarkers } from '../src';

// Shape produced by the precise mode for `sin x ^ 2 + cos x ^ 2 = 1`.
const marked =
  '\\htmlData{lbid=14}{\\htmlData{lbid=11}{\\htmlData{lbid=5}{\\left(\\htmlData{lbid=2}{\\sin \\htmlData{lbid=1}{x}}\\right)^{\\htmlData{lbid=4}{2}}} + \\htmlData{lbid=10}{\\left(\\htmlData{lbid=7}{\\cos \\htmlData{lbid=6}{x}}\\right)^{\\htmlData{lbid=9}{2}}}} = \\htmlData{lbid=13}{1}}';

const trusted = (tex: string) => () =>
  katex.renderToString(tex, {
    throwOnError: true,
    strict: 'ignore',
    trust: (ctx) => ctx.command === '\\htmlData',
  });

describe('stripMarkers', () => {
  it('removes every marker and keeps the contents', () => {
    expect(stripMarkers(marked)).toBe(
      '\\left(\\sin x\\right)^{2} + \\left(\\cos x\\right)^{2} = 1',
    );
    expect(stripMarkers('a + b')).toBe('a + b');
  });
});

describe('line breaking with markers', () => {
  it('splits through outer markers, keeping inner ones', () => {
    const split = splitTopLevel(marked);
    expect(split?.ops).toEqual(['=']);
    // The outer `lbid=14` (whole equation) is dropped; the left side keeps `lbid=11`.
    expect(split?.parts[0]).toContain('\\htmlData{lbid=11}');
    expect(split?.parts.join('')).not.toContain('lbid=14');
  });

  it('produces KaTeX-valid output (with \\htmlData trusted) at every depth', () => {
    for (let d = 0; d <= 3; d++) expect(trusted(breakLatex(marked, d))).not.toThrow();
  });
});

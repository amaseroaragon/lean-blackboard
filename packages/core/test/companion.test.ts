import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { manifestHasCompanion } from '../src';

const root = join(__dirname, '..', '..', '..');
const manifest = (p: string): unknown => JSON.parse(readFileSync(join(root, p), 'utf8'));

describe('manifestHasCompanion', () => {
  it('detects the companion package as a dependency', () => {
    expect(manifestHasCompanion(manifest('examples/lean-sample/lake-manifest.json'))).toBe(true);
    expect(manifestHasCompanion(manifest('examples/lean-mathlib/lake-manifest.json'))).toBe(true);
  });

  it('detects the companion package itself', () => {
    expect(manifestHasCompanion(manifest('lean/lake-manifest.json'))).toBe(true);
  });

  it('accepts names quoted with «»', () => {
    expect(manifestHasCompanion({ name: 'x', packages: [{ name: '«LeanBlackboard»' }] })).toBe(true);
  });

  it('is false for projects without it', () => {
    expect(manifestHasCompanion({ name: 'Dahlquist', packages: [{ name: 'mathlib' }, { name: 'proofwidgets' }] })).toBe(false);
    expect(manifestHasCompanion({ name: '«lean-sample»', packages: [] })).toBe(false);
    expect(manifestHasCompanion(null)).toBe(false);
    expect(manifestHasCompanion('nope')).toBe(false);
  });
});

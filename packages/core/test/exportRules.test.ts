import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultRulesJson } from '../src/rules/export';

describe('lean/LeanBlackboard/defaultRules.json', () => {
  it('is up to date with defaultRules (run `npm run export-rules`)', () => {
    const file = readFileSync(join(__dirname, '../../../lean/LeanBlackboard/defaultRules.json'), 'utf8');
    expect(file).toBe(defaultRulesJson());
  });
});

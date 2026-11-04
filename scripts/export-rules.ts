// Writes the default `symbols`/`functions` rules to `lean/LeanBlackboard/defaultRules.json`, so the
// Lean companion package (`#latex`, its tests) uses exactly the rules the extension sends.
// Run: `npm run export-rules`. A vitest test fails if the file is out of date.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultRulesJson } from '../packages/core/src/rules/export';

// Run through `npm run export-rules`, i.e. from the repository root.
const target = join(process.cwd(), 'lean', 'LeanBlackboard', 'defaultRules.json');
writeFileSync(target, defaultRulesJson());
console.log(`Wrote ${target}`);

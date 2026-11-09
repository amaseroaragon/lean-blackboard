// Writes the default `symbols`/`functions` rules to `lean/LeanBlackboard/defaultRules.json`, so the
// Lean companion package (`#latex`, its tests) uses exactly the rules the extension sends.
// Run: `npm run export-rules`. A vitest test fails if the file is out of date.

import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultRulesJson } from '../packages/core/src/rules/export';

// Run through `npm run export-rules`, i.e. from the repository root.
const target = join(process.cwd(), 'lean', 'LeanBlackboard', 'defaultRules.json');
writeFileSync(target, defaultRulesJson());
console.log(`Wrote ${target}`);

// Lake decides what to rebuild from source hashes and does not track `include_str`, so a stale
// `DefaultRules` build would keep the old rules: drop it to force a rebuild.
for (const dir of ['lib/lean/LeanBlackboard', 'ir/LeanBlackboard']) {
  const path = join(process.cwd(), 'lean', '.lake', 'build', dir);
  if (!existsSync(path)) continue;
  for (const f of readdirSync(path)) {
    if (f.startsWith('DefaultRules.')) rmSync(join(path, f));
  }
}

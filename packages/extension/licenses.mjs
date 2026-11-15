// Writes the license files that go into the .vsix: this project's LICENSE (kept at the repository
// root) and the notices of the third-party code bundled in the webview (KaTeX and its fonts).

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

copyFileSync(resolve(root, 'LICENSE'), resolve(here, 'LICENSE'));

const katex = resolve(root, 'node_modules/katex');
const { version } = JSON.parse(readFileSync(resolve(katex, 'package.json'), 'utf8'));
const notices = [
  'Lean Blackboard bundles the following third-party software.',
  '',
  '-'.repeat(78),
  `KaTeX ${version} (code, styles and fonts) - https://katex.org`,
  '-'.repeat(78),
  '',
  readFileSync(resolve(katex, 'LICENSE'), 'utf8').trim(),
  '',
].join('\n');
writeFileSync(resolve(here, 'ThirdPartyNotices.txt'), notices);

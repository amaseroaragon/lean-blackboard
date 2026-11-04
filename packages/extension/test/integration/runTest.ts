// Launches a real VS Code with the official Lean 4 extension and this extension, opens
// `examples/lean-sample` and runs `suite.ts` inside it.
//
// Prerequisites: `npm run build`, and `lake build` in `examples/lean-sample` (so that the
// companion package is compiled; otherwise the first test waits for the build).
// On Linux without a display, run under `xvfb-run -a`.

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const repo = resolve(__dirname, '../../..');
  const extensionDevelopmentPath = resolve(repo, 'packages/extension');
  const extensionTestsPath = resolve(extensionDevelopmentPath, 'dist-test/suite.js');
  const workspace = resolve(repo, 'examples/lean-sample');

  const vscodeExecutablePath = await downloadAndUnzipVSCode(process.env.VSCODE_VERSION ?? 'stable');
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
  // Our `extensionDependencies`: the official extension, from the Marketplace.
  const install = spawnSync(cli, [...cliArgs, '--install-extension', 'leanprover.lean4'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (install.status !== 0) throw new Error('Could not install leanprover.lean4');

  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [workspace, '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes'],
  });
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

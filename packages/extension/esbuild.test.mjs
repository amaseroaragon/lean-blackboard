import * as esbuild from 'esbuild';

// Integration tests: the runner (plain Node) and the suite (runs inside VS Code).
await esbuild.build({
  entryPoints: { runTest: 'test/integration/runTest.ts', suite: 'test/integration/suite.ts' },
  outdir: 'dist-test',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  external: ['vscode', '@vscode/test-electron'],
  logLevel: 'warning',
});

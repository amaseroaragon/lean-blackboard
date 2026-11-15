import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** Bundles the UI script plus its CSS (panel + KaTeX) and KaTeX fonts into `dist/`. */
const options = {
  entryPoints: { webview: 'src/main.ts' },
  // Written straight into the extension's dist so the host can serve it (also in watch mode).
  outdir: '../extension/dist/webview',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  minify: !watch,
  // Webviews are Chromium: only WOFF2 is ever loaded. The other formats KaTeX's CSS lists are
  // left as (unused) URLs instead of being copied.
  loader: { '.woff2': 'file' },
  external: ['*.woff', '*.ttf'],
  assetNames: 'fonts/[name]',
  logLevel: 'info',
};

if (watch) {
  await (await esbuild.context(options)).watch();
} else {
  await esbuild.build(options);
}

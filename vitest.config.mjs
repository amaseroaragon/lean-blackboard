import { defineConfig } from 'vitest/config';

// Unit and golden tests only. Integration tests run inside VS Code (`npm run test:integration`).
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.vscode-test/**', '**/dist/**'],
  },
});

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    // probe/ is a throwaway project outside the workspace; notes/ is private.
    ignores: ['**/node_modules/**', '**/dist/**', 'probe/**', 'notes/**', '.kiro/**'],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    // Enforces tech.md "No any. No non-null assertions in skeleton/core" on source
    // and test files alike. These are what `pnpm lint` checks; no test scans for them.
    files: ['skeleton/core/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
);

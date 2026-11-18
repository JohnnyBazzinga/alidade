import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
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
  {
    // tech.md "No any" for skeleton/sensors (Req 1.8). The non-null rule stays specific to Core.
    files: ['skeleton/sensors/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // skeleton/ui (Req 1.8, design D21): no `any`, and the two named hook rules as errors. The
    // plugin's `recommended` preset is not used: it adds compiler rules whose noise is unknown.
    files: ['skeleton/ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
);

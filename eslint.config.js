import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'legacy-archive-20260518', 'supabase/functions'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The repository historically could not start ESLint because the locked
      // typescript-eslint version was incompatible with ESLint 9. Keep the
      // now-visible legacy findings as a finite warning baseline so lint can
      // run on every PR without turning this tooling repair into a broad code
      // cleanup. The package script prevents the baseline from increasing.
      'no-control-regex': 'warn',
      'no-constant-binary-expression': 'warn',
      'no-useless-escape': 'warn',
      'prefer-const': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ['tests/controlled-ops/browser-pilot/**/*.ts'],
    rules: {
      // Playwright names its fixture callback `use`; it is not a React Hook.
      'react-hooks/rules-of-hooks': 'off',
    },
  },
);

/* Flat ESLint config (ESLint v9) */
const tsParser = require('@typescript-eslint/parser')
const tsPlugin = require('@typescript-eslint/eslint-plugin')
const reactRefresh = require('eslint-plugin-react-refresh')
const reactHooks = require('eslint-plugin-react-hooks')

module.exports = [
  // Ignore build artefacts
  {
    ignores: ['dist', 'dist-electron', 'release', 'node_modules', 'fix-arrows.cjs']
  },
  // TypeScript + React files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module'
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-refresh': reactRefresh,
      'react-hooks': reactHooks
    },
    rules: {
      // Replicate recommended rule sets
      ...tsPlugin.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
      // Relax overly strict defaults to match previous behavior
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['off', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'off',
      'react-hooks/exhaustive-deps': 'off'
    }
  },
  // Plain JS files (keep basic recommended checks)
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module'
    },
    rules: {
      // Use eslint:recommended equivalent (already implicit for JS, can extend if needed)
    }
  }
]
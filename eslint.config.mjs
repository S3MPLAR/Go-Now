import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'renderer/assets/**',
      'docs/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'mcp/src/**',
      'mcp/gonow-mcp.js'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs'
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': ['warn', { checkLoops: false }],
      'no-useless-escape': 'warn',
      'no-prototype-builtins': 'warn',
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn'
    }
  },
  {
    files: ['main.js', 'preload.js', 'src/**/*.js', 'mcp/**/*.js', 'scripts/**/*.js', 'tests/**/*.js', '*.config.js'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    files: ['renderer/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ppPicker: 'readonly', ppSound: 'readonly', quickParse: 'readonly' }
    }
  },
  {
    files: ['renderer/shared/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    }
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node }
    }
  }
];

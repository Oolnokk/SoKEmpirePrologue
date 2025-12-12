import js from '@eslint/js';
import globals from 'globals';

const baseConfig = {
  ...js.configs.recommended,
  files: ['src/**/*.js', 'tests/**/*.js', 'tools/**/*.{js,mjs}'],
  languageOptions: {
    ...js.configs.recommended.languageOptions,
    ecmaVersion: 2022,
    sourceType: 'module',
    globals: {
      ...globals.node,
      ...globals.browser, // Add browser globals for modules that may run in browser
    },
  },
  rules: {
    ...js.configs.recommended.rules,
    'no-console': 'off',
  },
};

const testConfig = {
  files: ['tests/**/*.js'],
  languageOptions: {
    globals: {
      ...globals.node,
      ...globals.mocha,
      ...globals.jest,
    },
  },
};

export default [
  {
    ignores: ['docs/**'],
  },
  baseConfig,
  testConfig,
];

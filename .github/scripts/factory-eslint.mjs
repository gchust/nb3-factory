// The application uses Vitest; the factory's standalone control scripts use
// Node's built-in test runner and must retain their own lint environment.
export default {
  files: ['.github/scripts/**/*.mjs'],
  languageOptions: {
    globals: {
      console: 'readonly',
      fetch: 'readonly',
      process: 'readonly',
      URL: 'readonly',
    },
  },
  rules: {
    'vitest/no-import-node-test': 'off',
  },
};

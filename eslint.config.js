import { createPortalConfig } from '@nocobase/dev-config/eslint';

const portalConfig = createPortalConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [
    '.extension-state/**',
    'client-old/**',
    'public/r/**',
    'public/storage/**',
    'storage/**',
  ],
});

export default [
  ...portalConfig,
  {
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
  },
];

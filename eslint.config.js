import factoryConfig from './.github/scripts/factory-eslint.mjs';

import { createApplicationConfig } from '@nocobase/dev-config/eslint';

const applicationConfig = createApplicationConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [
    '.extension-state/**',
    'client-old/**',
    'public/r/**',
    'storage/**',
  ],
  overrides: [
    {
      // Top-level workflow definitions and handlers use the server project.
      files: ['workflows/**/*.ts'],
      ignores: ['workflows/*/client/**'],
      languageOptions: {
        parserOptions: {
          projectService: false,
          project: './tsconfig.server.json',
        },
      },
    },
  ],
});

export default [
  ...(Array.isArray(applicationConfig)
    ? applicationConfig
    : [applicationConfig]),
  factoryConfig,
];

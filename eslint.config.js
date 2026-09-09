import factoryConfig from './.github/scripts/factory-eslint.mjs';

import { createPortalConfig } from '@nocobase/dev-config/eslint';

const applicationConfig = createPortalConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [
    '.extension-state/**',
    'client-old/**',
    'public/r/**',
    'storage/**',
  ],
  // `database/` holds server-side migrations and seeds, so the type-aware
  // project service must resolve them against the server tsconfig rather than
  // the client one that `tsconfig.json` (the default project) covers.
  overrides: [
    {
      files: ['database/**/*.ts'],
      languageOptions: {
        parserOptions: {
          project: ['./tsconfig.server.json'],
          projectService: false,
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

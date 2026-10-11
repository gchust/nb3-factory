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
});

export default [
  ...(Array.isArray(applicationConfig)
    ? applicationConfig
    : [applicationConfig]),
  factoryConfig,
];

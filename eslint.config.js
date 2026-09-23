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
});

export default [
  ...(Array.isArray(applicationConfig)
    ? applicationConfig
    : [applicationConfig]),
  factoryConfig,
];

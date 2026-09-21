import factoryConfig from './.github/scripts/factory-eslint.mjs';

import { createPortalConfig } from '@nocobase/dev-config/eslint';

const applicationConfig = createPortalConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [
    '.extension-state/**',
    // The factory overlays a control plane the application does not own and
    // must not edit. The factory formats and checks it outside the app's
    // source scope, so the app's Prettier and ESLint runs skip it too.
    '.github/**',
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

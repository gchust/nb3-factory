import { createPortalConfig } from '@nocobase/dev-config/eslint';
import factoryConfig from './.github/scripts/factory-eslint.mjs';

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

export default [...portalConfig, factoryConfig];

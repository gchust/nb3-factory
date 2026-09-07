import { createPortalConfig } from '@nocobase/dev-config/eslint';
import factoryConfig from './.github/scripts/factory-eslint.mjs';

const portalConfig = createPortalConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [
    // `.github/` is the factory control plane, not application code. Its own
    // scripts are verified by `pnpm factory:test` (node --test) and must not
    // be held to the application's lint rules; the factory's own files fail
    // the app config's `quotes` rule otherwise.
    '.github/**',
    '.extension-state/**',
    'client-old/**',
    'public/r/**',
    'public/storage/**',
    'storage/**',
  ],
});

export default [...portalConfig, factoryConfig];

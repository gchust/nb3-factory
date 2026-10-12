import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { MaterialsProvider } from './materials/index.js';

/**
 * Application-owned service providers. `MaterialsProvider` binds the materials domain service and registers the
 * feature's permission model; it is the only one this application currently owns.
 */
const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  MaterialsProvider,
];

export default serviceProviders;

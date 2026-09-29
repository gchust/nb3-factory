import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { ItTicketsProvider } from '../it-tickets/provider.js';

/**
 * The IT ticket provider is registered after the Authorization plugin so that
 * `authorizationToken` resolves when its `boot()` runs. Base providers are
 * added in `server/app.ts`; these are the application's own.
 */
const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ItTicketsProvider,
];

export default serviceProviders;

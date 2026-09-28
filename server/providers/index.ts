import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { ItSupportProvider } from '../it-support/provider.js';

/**
 * Application-owned providers. `ItSupportProvider` registers the ticket
 * Collection and composite resource with the authorization system before the
 * stored Permission Set grants are resolved.
 */
const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ItSupportProvider,
];

export default serviceProviders;

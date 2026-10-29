import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { HelpdeskAuthorizationProvider } from '../helpdesk/authorization-provider.js';
import { HelpdeskLifecycleProvider } from '../helpdesk/lifecycle-provider.js';

// Authorization boots before routes are served; the lifecycle runtime starts
// its effect job and trigger sweep with the application.
const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  HelpdeskLifecycleProvider,
  HelpdeskAuthorizationProvider,
];

export default serviceProviders;

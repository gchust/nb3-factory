import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { HelpdeskProvider } from './helpdesk.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  HelpdeskProvider,
];

export default serviceProviders;

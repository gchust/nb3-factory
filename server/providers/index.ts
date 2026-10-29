import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { DocumentsProvider } from './documents-provider.js';
import { LeaveProvider } from './leave-provider.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  LeaveProvider,
  DocumentsProvider,
];

export default serviceProviders;

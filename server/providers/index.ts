import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { DocumentCenterProvider } from './document-center.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  DocumentCenterProvider,
];

export default serviceProviders;

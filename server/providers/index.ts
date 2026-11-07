import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import DocumentsProvider from './documents.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  DocumentsProvider,
];

export default serviceProviders;

import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import AIResourcesProvider from './ai-resources.js';
import DocumentsProvider from './documents.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  DocumentsProvider,
  AIResourcesProvider,
];

export default serviceProviders;

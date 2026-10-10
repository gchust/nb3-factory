import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import KnowledgeProvider from './knowledge.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  KnowledgeProvider,
];

export default serviceProviders;

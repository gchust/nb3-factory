import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import { KnowledgeProvider } from './knowledge.js';
import { KnowledgeAIProvider } from './knowledge-ai.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  KnowledgeProvider,
  KnowledgeAIProvider,
];

export default serviceProviders;

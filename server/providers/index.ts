import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import { ServiceApplicationProvider } from './service-provider.js';
import { AIResourcesProvider } from './ai-resources.js';
import { ManualKnowledgeBaseProvider } from './manual-knowledge-base.js';

/**
 * Application-owned providers, in boot order. The service provider installs
 * roles and sample data first; the AI provider then hands its resources to
 * the AI Employee plugin's manager; the knowledge-base provider finally
 * registers the device-manual base those resources read.
 */
const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ServiceApplicationProvider,
  AIResourcesProvider,
  ManualKnowledgeBaseProvider,
];

export default serviceProviders;

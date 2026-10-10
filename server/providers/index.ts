import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ServiceAuthorizationProvider from './service-authorization.js';
import ServiceOrderProvider from './service-orders.js';
import ServiceSchedulerProvider from './service-scheduler.js';
import ServiceKnowledgeProvider from './service-knowledge.js';
import ServiceAssistantProvider from './service-assistant.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ServiceAuthorizationProvider,
  ServiceOrderProvider,
  ServiceSchedulerProvider,
  ServiceKnowledgeProvider,
  ServiceAssistantProvider,
];

export default serviceProviders;

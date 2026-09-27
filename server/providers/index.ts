import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import { ServiceRequestServiceProvider } from './service-request-service.js';
import { ServiceRequestWorkflowProvider } from './service-request-workflow.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ServiceRequestServiceProvider,
  ServiceRequestWorkflowProvider,
];

export default serviceProviders;

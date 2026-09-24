import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { ServiceRequestsProvider } from './service-requests.js';
import { WorkflowGateProvider } from './workflow-gate.js';

/**
 * Application services. The workflow gate registers first so the acceptance
 * service can depend on its token; both singletons build lazily, so this order
 * is documentation of the dependency rather than a requirement.
 */
const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  WorkflowGateProvider,
  ServiceRequestsProvider,
];

export default serviceProviders;

export { workflowGateToken } from './workflow-gate.js';
export {
  createServiceRequestsService,
  serviceRequestsServiceToken,
  ServiceRequestError,
  type ServiceRequestAcceptOutcome,
  type ServiceRequestAssignee,
  type ServiceRequestCreateInput,
  type ServiceRequestView,
  type ServiceRequestsDependencies,
  type ServiceRequestsService,
} from './service-requests.js';

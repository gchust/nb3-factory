import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { ServiceDomainProvider } from './service.js';
import { WorkflowModuleProvider } from './workflow-modules.js';

/**
 * The providers this application boots.
 *
 * The service domain provider binds `serviceToken` (which the `/api` service
 * routes resolve when they are created) in `register()`, teaches authorization
 * about the domain in `boot()`, and provisions the installation in `start()`.
 *
 * The workflow module provider points the Workflow Artifact store's module
 * resolution at the running server's own `node_modules`, so a Run node's
 * handler can import an application package; see that file for why the store's
 * configured location is not enough on its own.
 */
const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ServiceDomainProvider,
  WorkflowModuleProvider,
];

export default serviceProviders;

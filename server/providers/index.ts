import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { ServiceAuthorizationProvider } from './service-authorization.provider.js';
import { ServiceDomainProvider } from './service-domain.provider.js';
import { ServiceProvisioningProvider } from './service-provisioning.provider.js';
import { ServiceSchedulerProvider } from './service-scheduler.provider.js';

/**
 * Composition order matters: the authorization provider registers the composite
 * resources and record-access resolvers first, so the domain services resolve
 * against them; the scheduler provider reads the domain services; provisioning
 * runs last so the database has already migrated and seeded.
 */
const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ServiceAuthorizationProvider,
  ServiceDomainProvider,
  ServiceSchedulerProvider,
  ServiceProvisioningProvider,
];

export default serviceProviders;

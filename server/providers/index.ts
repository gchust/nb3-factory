import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import ServiceDeskRoleProvider from './roles.js';
import ServiceDeskLifecycleProvider from './lifecycle.js';
import ServiceDeskTicketProvider from './tickets.js';
import ServiceDeskSampleDataProvider from './sample-data.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ServiceDeskRoleProvider,
  ServiceDeskLifecycleProvider,
  ServiceDeskTicketProvider,
  ServiceDeskSampleDataProvider,
];

export default serviceProviders;

import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import EquipmentSchedulerProvider from './equipment-scheduler-provider.js';
import EquipmentServiceProvider from './equipment-service-provider.js';
import EquipmentWorkflowProvider from './equipment-workflow-provider.js';

/**
 * Application-owned providers. Order matters only in that the service provider
 * publishes the ticket service the scheduler targets call; both guard the
 * plugin token they need, so neither requires the other's plugin to be present.
 * The workflow provider activates the acceptance workflow after the workflow
 * plugin has materialized its artifacts.
 */
const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  EquipmentServiceProvider,
  EquipmentSchedulerProvider,
  EquipmentWorkflowProvider,
];

export default serviceProviders;

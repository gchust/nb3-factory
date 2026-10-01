import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import AIResourcesProvider from './ai-resources.js';
import ServiceDeskProvider from './service-desk.js';
import ScheduledTasksProvider from './scheduled-tasks.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ServiceDeskProvider,
  AIResourcesProvider,
  ScheduledTasksProvider,
];

export default serviceProviders;

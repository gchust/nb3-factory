import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import TodoSchedulerProvider from './todos-scheduler.js';
import TodoProvider from './todos.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  TodoProvider,
  TodoSchedulerProvider,
];

export default serviceProviders;

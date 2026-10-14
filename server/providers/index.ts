import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import TodoSchedulerProvider from './todo-scheduler.js';
import TodoProvider from './todos.js';

/**
 * Application providers. Order is boot order: `TodoProvider` binds the todo service, and `TodoSchedulerProvider`
 * registers the schedule and its target, which needs that service by the time a firing starts.
 */
const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  TodoProvider,
  TodoSchedulerProvider,
];

export default serviceProviders;

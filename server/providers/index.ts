import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ExpireTodosScheduleProvider from './expire-todos-schedule.js';
import TodoProvider from './todos.js';

/**
 * TodoProvider first: it binds `todoServiceToken`, which the schedule provider resolves in `boot()`. Registration of
 * every provider runs before any `boot()`, so the order only documents the dependency.
 */
const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  TodoProvider,
  ExpireTodosScheduleProvider,
];

export default serviceProviders;

import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { TodoProvider } from './todos.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  // The todo expiry task: the service the todo route reads, and the scheduler target and schedule that mark overdue
  // todos. See server/providers/todos.ts for why the schedule lives here rather than in a plugin.
  TodoProvider,
];

export default serviceProviders;

import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import overdueTodos from './overdue-todos.js';

export { overdueTodoServiceToken } from './overdue-todos.js';
export type { OverdueTodoService, TodoRecord } from './overdue-todos.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  overdueTodos,
];

export default serviceProviders;

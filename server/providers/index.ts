import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import TodoProvider, { todoServiceToken } from './todo.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  TodoProvider,
];

export { todoServiceToken };
export type { CreateTodoInput, MarkExpiredResult, TodoRecord } from './todo.js';

export default serviceProviders;

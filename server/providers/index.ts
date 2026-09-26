import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import TodoProvider from './todos.js';

export { todoServiceToken } from './todos.js';
export type { Todo, TodoService } from './todos.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  TodoProvider,
];

export default serviceProviders;

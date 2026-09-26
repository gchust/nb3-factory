import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { TodoProvider } from './todo.js';

export {
  createTodoService,
  todoServiceToken,
  TodoProvider,
  TodoTitleRequiredError,
} from './todo.js';
export type { Todo, TodoService } from './todo.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  TodoProvider,
];

export default serviceProviders;

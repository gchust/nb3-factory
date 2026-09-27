import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';
import TodoProvider from './todos.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  TodoProvider,
];

export {
  TodoProvider,
  todoServiceToken,
  TodoTitleConflictError,
  CHECK_OVERDUE_TODOS_SCHEDULE_KEY,
  CHECK_OVERDUE_TODOS_TARGET_TYPE,
  CHECK_OVERDUE_TODOS_TITLE,
} from './todos.js';
export type { TodoCreateInput, TodoRecord, TodoService } from './todos.js';

export default serviceProviders;

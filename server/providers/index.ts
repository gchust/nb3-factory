import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import AppExampleProvider from './app-example.js';
import TeamTodoProvider from './team-todos.js';

export {
  appExampleServiceToken,
  type AppExampleService,
} from './app-example.js';
export {
  teamTodoServiceToken,
  TeamTodoNotFoundError,
  TeamTodoService,
  TeamTodoValidationError,
  TODO_PRIORITIES,
  TODO_STATUSES,
  type TeamTodo,
  type TeamTodoInput,
  type TeamTodoListResult,
  type TeamTodoStats,
  type TodoPriority,
  type TodoStatus,
} from './team-todos.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  AppExampleProvider,
  TeamTodoProvider,
];

export default serviceProviders;

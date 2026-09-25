import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import { TodoServiceProvider } from './todos.js';

export {
  TODO_EXPIRY_SCHEDULE_KEY,
  TODO_EXPIRY_TARGET_TYPE,
  todoServiceToken,
} from './todos.js';
export type { MarkExpiredResult, TodoRecord, TodoService } from './todos.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  TodoServiceProvider,
];

export default serviceProviders;

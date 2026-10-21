import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import TodoProvider from './overdue-todos.js';

export { todoServiceToken, type TodoService } from './todos.js';
export {
  CHECK_OVERDUE_TODOS_SCHEDULE_KEY,
  CHECK_OVERDUE_TODOS_TARGET_TYPE,
} from './overdue-todos.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  TodoProvider,
];

export default serviceProviders;

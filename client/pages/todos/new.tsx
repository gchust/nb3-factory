import type { ReactElement } from 'react';

import { TodoFormDialog } from './todo-form-dialog.js';

/** `/todos/new`: the create dialog over the list. */
export default function NewTodoPage(): ReactElement {
  return <TodoFormDialog />;
}

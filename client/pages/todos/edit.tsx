import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { TodoFormDialog } from './todo-form-dialog.js';

/** `/todos/edit/:todoId`: the edit dialog opened from a row's menu. */
export default function EditTodoPage(): ReactElement {
  const { todoId } = useParams();
  const parsed = Number(todoId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  return <TodoFormDialog key={id ?? 'invalid'} todoId={id} />;
}

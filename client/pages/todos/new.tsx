import { useTranslation } from '@nocobase/i18n/client';
import { useRef, useState, type ReactElement } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';
import { useRouteOverlay } from '#components/use-route-overlay';

import { TodoForm } from './todo-form.js';
import type { TodoOutletContext } from './types.js';

const FORM_ID = 'todo-new-form';

/** The create dialog, at `/todos/new`: a child route, so it can be opened and closed by URL. */
export default function NewTodoPage(): ReactElement {
  const { t } = useTranslation();
  // The state disables the buttons; the ref is what `beforeClose` reads, because the state set right after a
  // successful save has not rendered yet when `close()` runs.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('todos.create.title')}
      description={t('todos.create.description')}
      className='sm:max-w-md'
      beforeClose={() => !submittingRef.current}
      footer={<NewTodoFooter submitting={submitting} />}
    >
      <NewTodoBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

/** `useRouteOverlay` and the list's outlet context are only reachable inside the dialog, so the form gets a wrapper. */
function NewTodoBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<TodoOutletContext>();

  return (
    <TodoForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function NewTodoFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();

  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('todos.create.cancel')}
      </Button>
      {/* Outside the <form> and linked through `form`, so Enter in a field still submits and a disabled button does not. */}
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('todos.create.submitting') : t('todos.create.submit')}
      </Button>
    </>
  );
}

'use client';

import { useTranslation } from '@nocobase/i18n/client';
import { useRef, useState, type ReactElement } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';
import { useRouteOverlay } from '#components/use-route-overlay';

import { TodosForm } from './todos-form.js';
import type { TodosOutletContext } from './types.js';

const FORM_ID = 'todo-new-form';

/** The create dialog: `RouteDialog` supplies the title and the buttons, `TodosForm` the fields. */
export default function NewTodoPage(): ReactElement {
  const { t } = useTranslation();
  // The state disables the buttons; the ref is for beforeClose to read: when close() runs right after a successful
  // save, the new state value has not rendered yet.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('todos.create.title')}
      description={t('todos.form.description')}
      className='sm:max-w-lg'
      // Closing is blocked while submitting: the × button, Esc and clicking the backdrop all go through beforeClose.
      beforeClose={() => !submittingRef.current}
      footer={<NewTodoFooter submitting={submitting} />}
    >
      <NewTodoBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

// useRouteOverlay() may only be called inside RouteDialog, so the form and the footer buttons each get a wrapper.
function NewTodoBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<TodosOutletContext>();
  return (
    <TodosForm
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
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('todos.create.submitting') : t('todos.create.submit')}
      </Button>
    </>
  );
}

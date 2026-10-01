import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { TodoForm } from './todo-form.js';
import type { Todo, TodosOutletContext } from './types.js';

const FORM_ID = 'todo-edit-form';

/** Route `/todos/:todoId/edit`: the edit dialog. */
export default function EditTodoPage(): ReactElement {
  const { todoId = '' } = useParams();
  // Key by id: switching to another record starts the dialog state over.
  return <EditTodo key={todoId} todoId={todoId} />;
}

function EditTodo({ todoId }: { readonly todoId: string }): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload } = useOutletContext<TodosOutletContext>();

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${todoId}:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly todo?: Todo;
    readonly error?: unknown;
  }>();
  // The edit form found the record no longer exists while saving.
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // Abort the request when the parameters change or the component unmounts, so an old result never overwrites a new one.
    const controller = new AbortController();
    const key = `${todoId}:${reloadCount}`;
    api
      .request<{ data: Todo }>({
        path: `todos/${encodeURIComponent(todoId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, todo: data });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setResult({ key, error });
          // The record no longer exists: the list behind may still show its row, so refresh it.
          if (error instanceof ApiClientError && error.status === 404) {
            reload();
          }
        },
      );
    return () => controller.abort();
  }, [api, reload, todoId, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  const notFound = gone || status === 404;
  const todo = notFound ? undefined : result?.todo;

  let body: ReactElement;
  if (notFound || status === 403) {
    // A retry cannot succeed, so explain the situation and offer no Retry.
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {notFound ? t('todos.error.notFound') : t('todos.error.forbidden')}
        </AlertDescription>
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('todos.error.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (!todo) {
    body = (
      <div role='status' aria-label={t('status.loading')} className='space-y-3'>
        <Skeleton className='h-9 w-full' />
        <Skeleton className='h-24 w-full' />
      </div>
    );
  } else {
    body = (
      <EditTodoBody
        todo={todo}
        onSubmittingChange={handleSubmittingChange}
        onSubmitted={() => {
          reload();
        }}
        onNotFound={() => {
          setGone(true);
          reload();
        }}
      />
    );
  }

  return (
    <RouteDialog
      title={t('todos.edit.title')}
      description={t('todos.form.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={
        todo ? (
          <EditTodoFooter submitting={submitting} />
        ) : (
          <EditTodoCloseFooter />
        )
      }
    >
      {body}
    </RouteDialog>
  );
}

function EditTodoBody({
  todo,
  onSubmittingChange,
  onSubmitted,
  onNotFound,
}: {
  readonly todo: Todo;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onSubmitted: (todo: Todo) => void;
  readonly onNotFound: () => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <TodoForm
      todo={todo}
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={(saved) => {
        onSubmitted(saved);
        void close();
      }}
      onNotFound={onNotFound}
    />
  );
}

function EditTodoFooter({
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
        {submitting ? t('actions.saving') : t('actions.save')}
      </Button>
    </>
  );
}

/** The dialog before the record has loaded, and when it cannot be loaded. */
function EditTodoCloseFooter(): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <Button type='button' variant='outline' onClick={() => void close()}>
      {t('actions.close')}
    </Button>
  );
}

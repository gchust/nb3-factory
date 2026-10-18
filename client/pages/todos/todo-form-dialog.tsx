import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { CircleAlertIcon } from 'lucide-react';
import {
  type FormEvent,
  type ReactElement,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import { RouteDialog } from '#components/route-dialog';
import { Alert, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Field, FieldLabel } from '#components/ui/field';
import { Input } from '#components/ui/input';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import { useRouteOverlay } from '#components/use-route-overlay';

import { DateTimeField } from './date-time-field.js';
import {
  combineDateAndTime,
  localTimeValue,
  type Todo,
  useTodosOutletContext,
} from './shared.js';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

export interface TodoFormDialogProps {
  /** The todo to edit; `null` means the URL carried an invalid id. */
  readonly todoId?: number | null;
}

/** The `/todos/new` and `/todos/edit/:todoId` child routes: one dialog, two entry points. */
export function TodoFormDialog({ todoId }: TodoFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { reload } = useTodosOutletContext();
  const isEdit = todoId !== undefined;
  const [loadState, setLoadState] = useState<LoadState>(
    isEdit && todoId !== null ? 'loading' : isEdit ? 'not-found' : 'ready',
  );
  const [todo, setTodo] = useState<Todo>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const formId = useId();

  useEffect(() => {
    if (!isEdit || todoId === null) {
      return;
    }

    let cancelled = false;
    api
      .request<{ data: Todo }>({ path: `/todos/${todoId}` })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setTodo(response.data);
        setLoadState('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiClientError && error.status === 404) {
          setLoadState('not-found');
          void reload();
          return;
        }
        setLoadState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [api, isEdit, loadAttempt, reload, todoId]);

  function setFormSubmitting(next: boolean): void {
    submittingRef.current = next;
    setSubmitting(next);
  }

  function handleNotFound(): void {
    setLoadState('not-found');
    void reload();
  }

  return (
    <RouteDialog
      title={isEdit ? t('todos.edit.title') : t('todos.create.title')}
      description={
        isEdit ? t('todos.edit.description') : t('todos.create.description')
      }
      beforeClose={() => !submittingRef.current}
      footer={
        <TodoDialogFooter
          formId={formId}
          submitting={submitting}
          canSubmit={loadState === 'ready'}
        />
      }
    >
      {loadState === 'loading' ? (
        <div
          className='flex flex-col gap-5'
          aria-busy='true'
          aria-label={t('todos.loading')}
        >
          <Skeleton className='h-4 w-16' />
          <Skeleton className='h-8 w-full' />
          <Skeleton className='h-4 w-20' />
          <Skeleton className='h-8 w-2/3' />
        </div>
      ) : null}

      {loadState === 'error' ? (
        <Alert variant='destructive'>
          <CircleAlertIcon aria-hidden='true' />
          <AlertTitle>{t('todos.loadError.title')}</AlertTitle>
          <p className='text-sm text-destructive/90'>
            {t('todos.loadError.description')}
          </p>
          <div className='col-start-2 mt-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => {
                setLoadState('loading');
                setLoadAttempt((attempt) => attempt + 1);
              }}
            >
              {t('status.retry')}
            </Button>
          </div>
        </Alert>
      ) : null}

      {loadState === 'not-found' ? (
        <Alert variant='destructive'>
          <CircleAlertIcon aria-hidden='true' />
          <AlertTitle>{t('todos.notFound.title')}</AlertTitle>
          <p className='text-sm text-destructive/90'>
            {t('todos.notFound.description')}
          </p>
        </Alert>
      ) : null}

      {loadState === 'ready' ? (
        <TodoForm
          formId={formId}
          todo={todo}
          todoId={todoId}
          onSubmittingChange={setFormSubmitting}
          onNotFound={handleNotFound}
        />
      ) : null}
    </RouteDialog>
  );
}

interface TodoFormProps {
  readonly formId: string;
  readonly todo?: Todo;
  readonly todoId?: number | null;
  readonly onSubmittingChange: (submitting: boolean) => void;
  readonly onNotFound: () => void;
}

interface FormErrors {
  readonly title?: string;
  readonly dueAt?: string;
}

function TodoForm({
  formId,
  todo,
  todoId,
  onSubmittingChange,
  onNotFound,
}: TodoFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { reload } = useTodosOutletContext();
  const isEdit = todo !== undefined;
  const [title, setTitle] = useState(todo?.title ?? '');
  const [dueDate, setDueDate] = useState<Date | undefined>(() =>
    todo ? new Date(todo.dueAt) : undefined,
  );
  const [dueTime, setDueTime] = useState(() =>
    todo ? localTimeValue(todo.dueAt) : '09:00',
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const nextErrors: {
      title?: string;
      dueAt?: string;
    } = {};
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      nextErrors.title = t('todos.form.titleRequired');
    } else if (trimmedTitle.length > 200) {
      nextErrors.title = t('todos.form.titleTooLong');
    }
    if (!dueDate) {
      nextErrors.dueAt = t('todos.form.dueAtRequired');
    } else if (!/^([01]\d|2[0-3]):[0-5]\d$/u.test(dueTime)) {
      nextErrors.dueAt = t('todos.form.timeInvalid');
    }

    setErrors(nextErrors);
    if (nextErrors.title) {
      titleInputRef.current?.focus();
      return;
    }
    if (nextErrors.dueAt) {
      document.getElementById(`${formId}-trigger`)?.focus();
      return;
    }
    if (!dueDate) {
      return;
    }

    setServerError(undefined);
    setSubmitting(true);
    onSubmittingChange(true);

    try {
      const body = {
        title: trimmedTitle,
        dueAt: combineDateAndTime(dueDate, dueTime),
      };
      if (isEdit && todoId != null) {
        await api.request<{ data: Todo }>({
          method: 'PATCH',
          path: `/todos/${todoId}`,
          json: body,
        });
      } else {
        await api.request<{ data: Todo }>({
          method: 'POST',
          path: '/todos',
          json: body,
        });
      }

      toaster.show({
        type: 'success',
        title: isEdit ? t('todos.toast.updated') : t('todos.toast.created'),
      });

      const refreshed = await reload();
      if (!refreshed) {
        toaster.show({ type: 'error', title: t('todos.refreshFailed') });
      }

      // Release the close guard before asking to close: a successful save is
      // not a reason for `beforeClose` to keep the dialog open.
      setSubmitting(false);
      onSubmittingChange(false);
      await close();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        onNotFound();
        return;
      }
      setServerError(t('todos.form.saveFailed'));
    } finally {
      setSubmitting(false);
      onSubmittingChange(false);
    }
  }

  return (
    <form
      id={formId}
      className='flex flex-col gap-5'
      noValidate
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      {serverError ? (
        <Alert variant='destructive'>
          <CircleAlertIcon aria-hidden='true' />
          <AlertTitle>{serverError}</AlertTitle>
        </Alert>
      ) : null}

      <Field data-invalid={Boolean(errors.title)}>
        <FieldLabel htmlFor={`${formId}-title`}>
          {t('todos.form.titleLabel')}
        </FieldLabel>
        <Input
          id={`${formId}-title`}
          ref={titleInputRef}
          value={title}
          maxLength={200}
          autoFocus
          placeholder={t('todos.form.titlePlaceholder')}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? `${formId}-title-error` : undefined}
          onChange={(event) => {
            setTitle(event.target.value);
            if (errors.title) {
              setErrors((current) => ({ ...current, title: undefined }));
            }
          }}
        />
        {errors.title ? (
          <p id={`${formId}-title-error`} className='text-sm text-destructive'>
            {errors.title}
          </p>
        ) : null}
      </Field>

      <DateTimeField
        id={formId}
        value={dueDate}
        time={dueTime}
        invalid={Boolean(errors.dueAt)}
        error={errors.dueAt}
        describedBy={errors.dueAt ? `${formId}-due-error` : undefined}
        onValueChange={(next) => {
          setDueDate(next);
          if (errors.dueAt) {
            setErrors((current) => ({ ...current, dueAt: undefined }));
          }
        }}
        onTimeChange={(next) => {
          setDueTime(next);
          if (errors.dueAt) {
            setErrors((current) => ({ ...current, dueAt: undefined }));
          }
        }}
      />
    </form>
  );
}

function TodoDialogFooter({
  formId,
  submitting,
  canSubmit,
}: {
  readonly formId: string;
  readonly submitting: boolean;
  readonly canSubmit: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();

  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting}
        onClick={() => {
          void close();
        }}
      >
        {canSubmit ? t('actions.cancel') : t('actions.close')}
      </Button>
      {canSubmit ? (
        <Button type='submit' form={formId} disabled={submitting}>
          {submitting ? <Spinner className='size-4' /> : null}
          {submitting ? t('todos.form.saving') : t('actions.save')}
        </Button>
      ) : null}
    </>
  );
}

import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  CheckIcon,
  ClipboardListIcon,
  ListTodoIcon,
  PlusIcon,
  RefreshCwIcon,
  Undo2Icon,
} from 'lucide-react';
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';

import { DataTable } from '@/components/data-table';
import { DatePicker } from '@/components/date-picker';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertAction, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import type { Todo } from './types.js';

type LoadError = 'forbidden' | 'failed';

/**
 * The minimal todo screen for the overdue-flagging feature: it shows the table
 * the scheduled task writes to, lets a user add a todo, and lets a user mark one
 * complete. The `expired` column changes only when the Scheduler plan runs; the
 * refresh button re-reads the table so that change can be observed.
 */
export default function TodosPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();

  const [rows, setRows] = useState<readonly Todo[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<LoadError | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState<Date | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [pendingId, setPendingId] = useState<number | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    // Keep the previous rows on screen while a refresh is in flight, so the
    // table does not flash a skeleton on every reload.
    api
      .request<{ data: Todo[] }>({
        path: 'todos',
        method: 'GET',
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setRows(data);
        setLoadError(undefined);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          error instanceof ApiClientError && error.status === 403
            ? 'forbidden'
            : 'failed',
        );
        setLoading(false);
      });
    return () => controller.abort();
  }, [api, reloadCount]);

  const dateTimeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  /**
   * Re-reads the table. It runs from a user action — the refresh button, a
   * retry, or a completed create — so putting the table into its loading state
   * here keeps that state change out of the effect body.
   */
  const refresh = useCallback((): void => {
    setLoading(true);
    reload();
  }, []);

  const toggleCompleted = useCallback(
    async (todo: Todo): Promise<void> => {
      setPendingId(todo.id);
      setActionError(undefined);
      try {
        const { data } = await api.request<{ data: Todo }>({
          path: `todos/${todo.id}`,
          method: 'PATCH',
          json: { completed: !todo.completed },
        });
        setRows((current) =>
          current?.map((row) => (row.id === data.id ? data : row)),
        );
      } catch {
        setActionError(t('todos.error.updateFailed'));
      } finally {
        setPendingId(undefined);
      }
    },
    [api, t],
  );

  const columns = useMemo<ColumnDef<Todo, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: t('todos.columns.title'),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.title}</span>
        ),
      },
      {
        accessorKey: 'dueAt',
        header: t('todos.columns.dueAt'),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {dateTimeFormat.format(new Date(row.original.dueAt))}
          </span>
        ),
      },
      {
        accessorKey: 'completed',
        header: t('todos.columns.completed'),
        cell: ({ row }) =>
          row.original.completed ? (
            <Badge variant='secondary'>{t('todos.completed')}</Badge>
          ) : (
            <Badge variant='outline'>{t('todos.incomplete')}</Badge>
          ),
      },
      {
        accessorKey: 'expired',
        header: t('todos.columns.expired'),
        cell: ({ row }) =>
          row.original.expired ? (
            <Badge variant='destructive'>{t('todos.expired')}</Badge>
          ) : (
            <Badge variant='outline'>{t('todos.active')}</Badge>
          ),
      },
      {
        id: 'actions',
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => {
          const todo = row.original;
          return (
            <div className='text-right'>
              <Button
                variant='outline'
                size='sm'
                disabled={pendingId === todo.id}
                onClick={() => void toggleCompleted(todo)}
              >
                {pendingId === todo.id ? (
                  <Spinner />
                ) : todo.completed ? (
                  <Undo2Icon />
                ) : (
                  <CheckIcon />
                )}
                {todo.completed
                  ? t('todos.markIncomplete')
                  : t('todos.markComplete')}
              </Button>
            </div>
          );
        },
      },
    ],
    // `toggleCompleted` is memoized, so the column set changes only when the
    // pending row, the wording, or the date formatter does.
    [t, dateTimeFormat, pendingId, toggleCompleted],
  );

  const openCreate = (): void => {
    setTitle('');
    setDueAt(undefined);
    setCreateError(undefined);
    setCreating(true);
  };

  const submitCreate = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setCreateError(t('todos.error.titleRequired'));
      return;
    }
    if (!dueAt) {
      setCreateError(t('todos.error.dueAtRequired'));
      return;
    }
    setSubmitting(true);
    setCreateError(undefined);
    try {
      await api.request<{ data: Todo }>({
        path: 'todos',
        method: 'POST',
        json: { title: trimmed, dueAt: dueAt.toISOString() },
      });
      setCreating(false);
      refresh();
    } catch {
      setCreateError(t('todos.error.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const content = (() => {
    if (loadError === 'forbidden') {
      return (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertTitle>{t('todos.error.forbidden')}</AlertTitle>
        </Alert>
      );
    }
    if (loadError === 'failed') {
      return (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertTitle>{t('todos.error.requestFailed')}</AlertTitle>
          <AlertAction>
            <Button variant='outline' size='sm' onClick={refresh}>
              {t('todos.error.retry')}
            </Button>
          </AlertAction>
        </Alert>
      );
    }
    if (rows === undefined) {
      return (
        <div className='space-y-3' role='status'>
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <Empty>
          <EmptyMedia variant='icon'>
            <ClipboardListIcon />
          </EmptyMedia>
          <EmptyTitle>{t('todos.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('todos.empty.description')}</EmptyDescription>
          <EmptyContent>
            <Button variant='outline' onClick={openCreate}>
              <PlusIcon data-icon='inline-start' />
              {t('todos.newTodo')}
            </Button>
          </EmptyContent>
        </Empty>
      );
    }
    return (
      <DataTable
        columns={columns}
        data={[...rows]}
        getRowId={(todo) => String(todo.id)}
        showSelectedCount={false}
        emptyMessage={t('todos.empty.title')}
      />
    );
  })();

  return (
    <PageContainer>
      <PageHeader
        title={t('todos.title')}
        description={t('todos.description')}
        actions={
          <>
            <Button
              variant='outline'
              onClick={refresh}
              disabled={loading && rows !== undefined}
            >
              <RefreshCwIcon data-icon='inline-start' />
              {t('todos.refresh')}
            </Button>
            <Button onClick={openCreate}>
              <PlusIcon data-icon='inline-start' />
              {t('todos.newTodo')}
            </Button>
          </>
        }
      />

      {actionError ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertTitle>{actionError}</AlertTitle>
        </Alert>
      ) : null}

      <div className='space-y-4'>
        <div className='flex items-center gap-2'>
          <ListTodoIcon className='size-4 text-muted-foreground' />
          <span className='text-sm text-muted-foreground'>
            {t('todos.scheduledHint')}
          </span>
          {loading && rows !== undefined ? <Spinner /> : null}
        </div>
        {content}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className='sm:max-w-md'>
          <form onSubmit={(event) => void submitCreate(event)}>
            <DialogHeader>
              <DialogTitle>{t('todos.newTodo')}</DialogTitle>
              <DialogDescription>
                {t('todos.newTodoDescription')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field>
                <FieldLabel htmlFor='todo-title'>
                  {t('todos.columns.title')}
                </FieldLabel>
                <Input
                  id='todo-title'
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={255}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='todo-due-at'>
                  {t('todos.columns.dueAt')}
                </FieldLabel>
                <DatePicker
                  id='todo-due-at'
                  value={dueAt}
                  onChange={setDueAt}
                  className='w-full'
                />
              </Field>
            </FieldGroup>
            {createError ? (
              <p role='alert' className='text-sm text-destructive'>
                {createError}
              </p>
            ) : null}
            <DialogFooter className='mt-4'>
              <Button
                type='button'
                variant='outline'
                disabled={submitting}
                onClick={() => setCreating(false)}
              >
                {t('actions.cancel')}
              </Button>
              <Button type='submit' disabled={submitting}>
                {submitting ? <Spinner /> : null}
                {t('todos.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

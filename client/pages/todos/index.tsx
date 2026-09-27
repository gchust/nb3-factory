import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import {
  AlertCircleIcon,
  CheckIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
} from 'lucide-react';
import { type FormEvent, type ReactElement, useEffect, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DatePicker } from '@/components/date-picker';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';

import type { Todo } from './types.js';

interface TodosResult {
  readonly key: string;
  readonly todos?: readonly Todo[];
  readonly error?: unknown;
}

/**
 * The todos page. It is the surface the scheduled "检查过期待办" task acts on:
 * the deadline column shows what a run would consider, and the expired badge is
 * written only by that task, never by the page.
 */
export default function TodosPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<TodosResult>();
  const [pendingIds, setPendingIds] = useState<readonly number[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState<Date | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  const requestKey = `todos:${reloadCount}`;

  useEffect(() => {
    const controller = new AbortController();
    const key = `todos:${reloadCount}`;
    api
      .request<{ data: Todo[] }>({ path: 'todos', signal: controller.signal })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, todos: data });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setResult({ key, error });
        },
      );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const todos = result?.todos ?? [];

  function reload(): void {
    setReloadCount((count) => count + 1);
  }

  async function toggleCompleted(todo: Todo): Promise<void> {
    setPendingIds((ids) => [...ids, todo.id]);
    try {
      await api.request<{ data: Todo }>({
        path: `todos/${todo.id}`,
        method: 'PATCH',
        json: { completed: !todo.completed },
      });
      reload();
    } catch {
      toast.add({ type: 'error', title: t('todos.actionFailed') });
    } finally {
      setPendingIds((ids) => ids.filter((id) => id !== todo.id));
    }
  }

  async function submitCreate(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!title.trim()) {
      toast.add({ type: 'error', title: t('todos.titleRequired') });
      return;
    }
    if (!dueAt) {
      toast.add({ type: 'error', title: t('todos.dueAtRequired') });
      return;
    }

    setCreating(true);
    try {
      await api.request<{ data: Todo }>({
        path: 'todos',
        method: 'POST',
        json: { title: title.trim(), dueAt: dueAt.toISOString() },
      });
      setCreateOpen(false);
      setTitle('');
      setDueAt(undefined);
      reload();
      toast.add({ type: 'success', title: t('todos.created') });
    } catch {
      toast.add({ type: 'error', title: t('todos.actionFailed') });
    } finally {
      setCreating(false);
    }
  }

  const columns: ColumnDef<Todo>[] = [
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('todos.columnTitle')} />
      ),
      cell: ({ row }) => (
        <span className='font-medium'>{row.original.title}</span>
      ),
    },
    {
      accessorKey: 'dueAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('todos.columnDueAt')} />
      ),
      cell: ({ row }) => (
        <span className='text-muted-foreground'>
          {format(new Date(row.original.dueAt), 'PPp')}
        </span>
      ),
    },
    {
      accessorKey: 'completed',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('todos.columnCompleted')}
        />
      ),
      cell: ({ row }) =>
        row.original.completed ? (
          <Badge variant='secondary'>{t('todos.completed')}</Badge>
        ) : (
          <Badge variant='outline'>{t('todos.incomplete')}</Badge>
        ),
    },
    {
      accessorKey: 'expired',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('todos.columnExpired')}
        />
      ),
      cell: ({ row }) =>
        row.original.expired ? (
          <Badge variant='destructive'>{t('todos.expired')}</Badge>
        ) : (
          <Badge variant='outline'>{t('todos.notExpired')}</Badge>
        ),
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => {
        const todo = row.original;
        const pending = pendingIds.includes(todo.id);
        return (
          <div className='text-right'>
            <Button
              variant='outline'
              size='sm'
              disabled={pending}
              onClick={() => {
                void toggleCompleted(todo);
              }}
            >
              {pending ? (
                <Spinner data-icon='inline-start' />
              ) : todo.completed ? (
                <RotateCcwIcon data-icon='inline-start' />
              ) : (
                <CheckIcon data-icon='inline-start' />
              )}
              {todo.completed
                ? t('todos.markIncomplete')
                : t('todos.markCompleted')}
            </Button>
          </div>
        );
      },
    },
  ];

  const errorMessage =
    error instanceof ApiClientError && error.status === 403
      ? t('todos.forbidden')
      : t('todos.loadFailed');

  return (
    <PageContainer>
      <PageHeader
        title={t('todos.title')}
        description={t('todos.description')}
        actions={
          <>
            <Button
              variant='outline'
              size='sm'
              disabled={loading}
              onClick={reload}
            >
              {loading ? (
                <Spinner data-icon='inline-start' />
              ) : (
                <RefreshCwIcon data-icon='inline-start' />
              )}
              {t('todos.refresh')}
            </Button>
            <Button size='sm' onClick={() => setCreateOpen(true)}>
              <PlusIcon data-icon='inline-start' />
              {t('todos.create')}
            </Button>
          </>
        }
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>{errorMessage}</AlertDescription>
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      <DataTable
        columns={columns}
        data={[...todos]}
        emptyMessage={loading ? t('status.loading') : t('todos.empty')}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className='sm:max-w-md'>
          <form onSubmit={(event) => void submitCreate(event)}>
            <DialogHeader>
              <DialogTitle>{t('todos.createTitle')}</DialogTitle>
              <DialogDescription>
                {t('todos.createDescription')}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field>
                <FieldLabel htmlFor='todo-title'>
                  {t('todos.titleLabel')}
                </FieldLabel>
                <Input
                  id='todo-title'
                  name='title'
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t('todos.titlePlaceholder')}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='todo-dueAt'>
                  {t('todos.dueAtLabel')}
                </FieldLabel>
                <DatePicker
                  id='todo-dueAt'
                  value={dueAt}
                  onChange={setDueAt}
                  placeholder={t('todos.dueAtPlaceholder')}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setCreateOpen(false)}
              >
                {t('todos.cancel')}
              </Button>
              <Button type='submit' disabled={creating}>
                {creating ? <Spinner data-icon='inline-start' /> : null}
                {creating ? t('todos.submitting') : t('todos.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

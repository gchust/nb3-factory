import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import {
  type FormEvent,
  type ReactElement,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { toast } from 'sonner';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DatePicker } from '@/components/date-picker';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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

/** The todo shape `GET /api/todos` returns. */
interface Todo {
  readonly id: number;
  readonly title: string;
  readonly deadline: string;
  readonly completed: boolean;
  readonly expired: boolean;
  readonly createdAt: string;
}

/**
 * Minimal todo page that exists to observe the scheduled `检查过期待办` plan.
 *
 * The page never marks a todo expired itself: it only reads, creates and
 * toggles completed. The expired flag appears after the Scheduler's target
 * runs, which is what makes a real scheduling run observable here. "Refresh"
 * is an honest read of the API, not a timer pretending to be the scheduler.
 */
export default function TodosPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const [result, setResult] = useState<{ key: string; todos: Todo[] }>();
  const [failed, setFailed] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const [creating, setCreating] = useState(false);
  const [deadline, setDeadline] = useState<Date>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [search, setSearch] = useState('');

  const requestKey = `todos:${reloadCount}`;
  const loading = result?.key !== requestKey;
  const todos = useMemo(() => result?.todos ?? [], [result]);

  function reload(): void {
    setReloadCount((count) => count + 1);
  }

  useEffect(() => {
    const controller = new AbortController();
    api
      .request<{ data: Todo[] }>({ path: 'todos', signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, todos: response.data });
        setFailed(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFailed(true);
      });
    return () => {
      controller.abort();
    };
  }, [api, requestKey]);

  const stats = useMemo(() => {
    let incomplete = 0;
    let expired = 0;
    let completed = 0;
    for (const todo of todos) {
      if (todo.completed) completed += 1;
      else incomplete += 1;
      if (todo.expired) expired += 1;
    }
    return { total: todos.length, incomplete, expired, completed };
  }, [todos]);

  async function toggle(todo: Todo, completed: boolean): Promise<void> {
    setPendingId(todo.id);
    try {
      const response = await api.request<{ data: Todo }>({
        path: `todos/${todo.id}`,
        method: 'PATCH',
        json: { completed },
      });
      const updated = response.data;
      setResult((current) =>
        current
          ? {
              ...current,
              todos: current.todos.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : current,
      );
      toast.success(t('todos.updated'));
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 404) {
        toast.error(t('todos.error.notFound'));
        reload();
      } else if (error instanceof ApiClientError && error.status === 403) {
        toast.error(t('todos.error.forbidden'));
      } else {
        toast.error(t('todos.error.failed'));
      }
    } finally {
      setPendingId(null);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const rawTitle = data.get('title');
    const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
    if (title.length === 0 || !deadline) {
      setFormError(t('todos.error.invalid'));
      return;
    }

    // The picker chooses a day; a deadline means the end of that day.
    const due = new Date(deadline);
    due.setHours(23, 59, 59, 999);

    setSubmitting(true);
    try {
      await api.request({
        path: 'todos',
        method: 'POST',
        json: { title, deadline: due.toISOString() },
      });
      toast.success(t('todos.created'));
      setCreating(false);
      setDeadline(undefined);
      setFormError(undefined);
      reload();
    } catch (error: unknown) {
      if (
        error instanceof ApiClientError &&
        error.code === 'TODO_TITLE_TAKEN'
      ) {
        setFormError(t('todos.error.duplicate'));
      } else if (error instanceof ApiClientError && error.status === 403) {
        setFormError(t('todos.error.forbidden'));
      } else {
        setFormError(t('todos.error.failed'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const columns: ColumnDef<Todo>[] = [
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('todos.column.title')}
        />
      ),
      cell: ({ row }) => (
        <span className='font-medium'>{row.original.title}</span>
      ),
    },
    {
      accessorKey: 'deadline',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('todos.column.deadline')}
        />
      ),
      cell: ({ row }) => (
        <span className='text-muted-foreground'>
          {new Date(row.original.deadline).toLocaleString()}
        </span>
      ),
    },
    {
      id: 'status',
      header: t('todos.column.status'),
      cell: ({ row }) => {
        const todo = row.original;
        if (todo.completed) {
          return (
            <Badge variant='secondary'>{t('todos.status.completed')}</Badge>
          );
        }
        if (todo.expired) {
          return (
            <Badge variant='destructive'>{t('todos.status.expired')}</Badge>
          );
        }
        return <Badge variant='outline'>{t('todos.status.pending')}</Badge>;
      },
    },
    {
      id: 'actions',
      header: () => (
        <span className='block text-right'>{t('todos.column.actions')}</span>
      ),
      cell: ({ row }) => (
        <div className='flex justify-end'>
          <Checkbox
            checked={row.original.completed}
            disabled={pendingId === row.original.id}
            aria-label={t('todos.column.actions')}
            onCheckedChange={(checked) => {
              if (typeof checked === 'boolean') {
                void toggle(row.original, checked);
              }
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={t('todos.title')}
        description={t('todos.description')}
        actions={
          <>
            <Button
              variant='outline'
              disabled={loading}
              onClick={() => reload()}
            >
              {loading ? (
                <Spinner data-icon='inline-start' />
              ) : (
                <RefreshCwIcon data-icon='inline-start' />
              )}
              {t('todos.refresh')}
            </Button>
            <Button
              onClick={() => {
                setFormError(undefined);
                setDeadline(undefined);
                setCreating(true);
              }}
            >
              <PlusIcon data-icon='inline-start' />
              {t('todos.new')}
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('todos.banner.title')}</CardTitle>
          <CardDescription>{t('todos.banner.description')}</CardDescription>
        </CardHeader>
      </Card>

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {(
          [
            ['total', stats.total],
            ['incomplete', stats.incomplete],
            ['expired', stats.expired],
            ['completed', stats.completed],
          ] as const
        ).map(([key, value]) => (
          <Card key={key}>
            <CardHeader>
              <CardDescription>{t(`todos.stats.${key}`)}</CardDescription>
              <CardTitle className='text-3xl tabular-nums'>{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {failed ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('todos.error.failed')}</CardTitle>
            <CardDescription>
              <Button
                variant='outline'
                size='sm'
                className='mt-2'
                onClick={() => reload()}
              >
                {t('status.retry')}
              </Button>
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={todos}
          emptyMessage={t('todos.empty')}
          toolbar={(table) => (
            <Input
              className='max-w-xs'
              placeholder={t('todos.searchPlaceholder')}
              value={search}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setSearch(value);
                table.getColumn('title')?.setFilterValue(value);
              }}
            />
          )}
        />
      )}

      <Card>
        <CardContent className='pt-6 text-sm text-muted-foreground'>
          {t('todos.resultHint')}
        </CardContent>
      </Card>

      <Dialog
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
          if (!open) {
            setFormError(undefined);
            setDeadline(undefined);
          }
        }}
      >
        <DialogContent>
          <form onSubmit={(event) => void create(event)}>
            <DialogHeader>
              <DialogTitle>{t('todos.new')}</DialogTitle>
              <DialogDescription>{t('todos.newDescription')}</DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-4'>
              <Field>
                <FieldLabel htmlFor='todo-title'>
                  {t('todos.field.title')}
                </FieldLabel>
                <Input
                  id='todo-title'
                  name='title'
                  autoComplete='off'
                  placeholder={t('todos.field.titlePlaceholder')}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='todo-deadline'>
                  {t('todos.field.deadline')}
                </FieldLabel>
                <DatePicker
                  value={deadline}
                  onChange={setDeadline}
                  align='start'
                />
              </Field>
              {formError ? (
                <p className='text-sm text-destructive'>{formError}</p>
              ) : null}
            </FieldGroup>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setCreating(false)}
              >
                {t('actions.cancel')}
              </Button>
              <Button type='submit' disabled={submitting}>
                {submitting ? <Spinner data-icon='inline-start' /> : null}
                {t('todos.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

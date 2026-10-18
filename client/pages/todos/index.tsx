import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  CalendarClockIcon,
  CircleAlertIcon,
  CircleCheckBigIcon,
  CircleIcon,
  ListTodoIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SearchXIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Button, buttonVariants } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Input } from '#components/ui/input';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { cn } from 'cn';

import { DeleteTodoDialog } from './delete-todo-dialog.js';
import {
  formatDueDate,
  type Todo,
  todoStatus,
  type TodosOutletContext,
} from './shared.js';

type PageState = 'loading' | 'ready' | 'error';

export default function TodosPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [todos, setTodos] = useState<readonly Todo[]>([]);
  const [pageState, setPageState] = useState<PageState>('loading');
  const [reloading, setReloading] = useState(false);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [deleteTarget, setDeleteTarget] = useState<Todo>();
  const query = searchParams.get('q') ?? '';

  /**
   * The list is read-only. The overdue check runs on its Scheduler schedule, so
   * opening the page never writes a status behind the schedule's back.
   */
  const fetchTodos = useCallback(
    () => api.request<{ data: readonly Todo[] }>({ path: '/todos' }),
    [api],
  );

  const load = useCallback(
    async (silent = false): Promise<boolean> => {
      setReloading(true);
      if (!silent) {
        setPageState('loading');
      }
      try {
        const response = await fetchTodos();
        setTodos(response.data);
        setPageState('ready');
        return true;
      } catch {
        if (!silent) {
          setPageState('error');
        }
        return false;
      } finally {
        setReloading(false);
      }
    },
    [fetchTodos],
  );

  const reload = useCallback(() => load(true), [load]);
  const outletContext = useMemo<TodosOutletContext>(
    () => ({ reload }),
    [reload],
  );

  useEffect(() => {
    let cancelled = false;
    fetchTodos()
      .then((response) => {
        if (cancelled) {
          return;
        }
        setTodos(response.data);
        setPageState('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setPageState('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchTodos]);

  const visibleTodos = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return todos;
    }
    return todos.filter((todo) => todo.title.toLowerCase().includes(term));
  }, [query, todos]);

  function setQuery(next: string): void {
    const params = new URLSearchParams(searchParams);
    if (next) {
      params.set('q', next);
    } else {
      params.delete('q');
    }
    setSearchParams(params, { replace: true });
  }

  function markPending(id: number, pending: boolean): void {
    setPendingIds((current) => {
      const next = new Set(current);
      if (pending) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  async function toggleTodo(todo: Todo): Promise<void> {
    if (pendingIds.has(todo.id)) {
      return;
    }
    markPending(todo.id, true);
    try {
      const response = await api.request<{ data: Todo }>({
        method: 'PATCH',
        path: `/todos/${todo.id}`,
        json: { completed: !todo.completed },
      });
      const updated = response.data;
      setTodos((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        toaster.show({ type: 'error', title: t('todos.notFound.title') });
        void reload();
      } else {
        toaster.show({ type: 'error', title: t('todos.toggleFailed') });
      }
    } finally {
      markPending(todo.id, false);
    }
  }

  function handleDeleted(id: number): void {
    setTodos((current) => current.filter((todo) => todo.id !== id));
  }

  function removeTodo(todo: Todo): void {
    setDeleteTarget(todo);
  }

  const showCreate = pageState !== 'ready' || todos.length > 0;
  // A real link: this navigates, so it must keep link semantics for the
  // keyboard, the status bar and "open in a new tab".
  const createButton = (
    <Link
      to={{ pathname: 'new', search: location.search }}
      className={buttonVariants()}
    >
      <PlusIcon data-icon='inline-start' />
      {t('todos.create.action')}
    </Link>
  );

  return (
    <PageContainer className='mx-auto max-w-5xl'>
      <PageHeader
        title={t('todos.title')}
        description={t('todos.description')}
        actions={showCreate ? createButton : undefined}
      />

      {pageState === 'loading' ? (
        <div
          className='flex flex-col gap-4 rounded-xl border border-border bg-card p-4'
          aria-busy='true'
          aria-label={t('todos.loading')}
        >
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className='flex items-center gap-3'>
              <Skeleton className='size-7 shrink-0 rounded-full' />
              <div className='flex min-w-0 flex-1 flex-col gap-2'>
                <Skeleton className='h-4 w-2/5' />
                <Skeleton className='h-3 w-1/4' />
              </div>
              <Skeleton className='h-5 w-16 shrink-0 rounded-full' />
            </div>
          ))}
        </div>
      ) : null}

      {pageState === 'error' ? (
        <Alert variant='destructive'>
          <CircleAlertIcon aria-hidden='true' />
          <AlertTitle>{t('todos.loadError.title')}</AlertTitle>
          <AlertDescription>
            {t('todos.loadError.description')}
          </AlertDescription>
          <AlertAction>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => {
                void load();
              }}
            >
              <RefreshCwIcon data-icon='inline-start' />
              {t('status.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {pageState === 'ready' ? (
        todos.length === 0 ? (
          <Empty className='border border-dashed border-border'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <ListTodoIcon aria-hidden='true' />
              </EmptyMedia>
              <EmptyTitle>{t('todos.empty.title')}</EmptyTitle>
              <EmptyDescription>
                {t('todos.empty.description')}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{createButton}</EmptyContent>
          </Empty>
        ) : (
          <>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
              <div className='relative w-full sm:max-w-xs'>
                <SearchIcon
                  className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
                  aria-hidden='true'
                />
                <Input
                  type='text'
                  inputMode='search'
                  value={query}
                  placeholder={t('todos.search.placeholder')}
                  aria-label={t('todos.search.placeholder')}
                  onChange={(event) => setQuery(event.target.value)}
                  className='pr-9 pl-9'
                />
                {query ? (
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-xs'
                    aria-label={t('todos.search.clear')}
                    onClick={() => setQuery('')}
                    className='absolute top-1/2 right-1.5 -translate-y-1/2'
                  >
                    <XIcon />
                  </Button>
                ) : null}
              </div>
              <p
                className='flex items-center gap-2 text-sm text-muted-foreground'
                aria-live='polite'
              >
                {reloading ? <Spinner className='size-3.5' /> : null}
                {t('todos.showing', { count: visibleTodos.length })}
              </p>
            </div>

            {visibleTodos.length === 0 ? (
              <Empty className='border border-dashed border-border'>
                <EmptyHeader>
                  <EmptyMedia variant='icon'>
                    <SearchXIcon aria-hidden='true' />
                  </EmptyMedia>
                  <EmptyTitle>{t('todos.noResults.title')}</EmptyTitle>
                  <EmptyDescription>
                    {t('todos.noResults.description')}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => setQuery('')}
                  >
                    {t('todos.noResults.action')}
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <>
                <div className='hidden overflow-hidden rounded-xl border border-border bg-card md:block'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className='w-12'>
                          <span className='sr-only'>
                            {t('todos.columns.completed')}
                          </span>
                        </TableHead>
                        <TableHead>{t('todos.columns.title')}</TableHead>
                        <TableHead className='w-52'>
                          {t('todos.columns.dueAt')}
                        </TableHead>
                        <TableHead className='w-28'>
                          {t('todos.columns.status')}
                        </TableHead>
                        <TableHead className='w-14 text-right'>
                          <span className='sr-only'>
                            {t('todos.actions.menu')}
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleTodos.map((todo) => (
                        <TableRow key={todo.id}>
                          <TableCell>
                            <TodoToggle
                              todo={todo}
                              pending={pendingIds.has(todo.id)}
                              onToggle={toggleTodo}
                            />
                          </TableCell>
                          <TableCell className='max-w-0 whitespace-normal'>
                            <span
                              className={cn(
                                'font-medium break-words',
                                todo.completed &&
                                  'text-muted-foreground line-through',
                              )}
                            >
                              {todo.title}
                            </span>
                          </TableCell>
                          <TableCell className='text-muted-foreground'>
                            <time dateTime={todo.dueAt}>
                              {formatDueDate(todo.dueAt, i18n.language)}
                            </time>
                          </TableCell>
                          <TableCell>
                            <TodoStatusBadge todo={todo} />
                          </TableCell>
                          <TableCell className='text-right'>
                            <TodoRowActions todo={todo} onDelete={removeTodo} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <ul className='flex flex-col gap-3 md:hidden'>
                  {visibleTodos.map((todo) => (
                    <li
                      key={todo.id}
                      className='rounded-xl border border-border bg-card p-4'
                    >
                      <div className='flex items-start gap-2'>
                        <TodoToggle
                          todo={todo}
                          pending={pendingIds.has(todo.id)}
                          onToggle={toggleTodo}
                        />
                        <div className='min-w-0 flex-1'>
                          <p
                            className={cn(
                              'font-medium break-words',
                              todo.completed &&
                                'text-muted-foreground line-through',
                            )}
                          >
                            {todo.title}
                          </p>
                          <div className='mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground'>
                            <span className='flex items-center gap-1.5'>
                              <CalendarClockIcon
                                className='size-3.5 shrink-0'
                                aria-hidden='true'
                              />
                              <time dateTime={todo.dueAt}>
                                {formatDueDate(todo.dueAt, i18n.language)}
                              </time>
                            </span>
                            <TodoStatusBadge todo={todo} />
                          </div>
                        </div>
                        <TodoRowActions todo={todo} onDelete={removeTodo} />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )
      ) : null}

      <Outlet context={outletContext} />

      <DeleteTodoDialog
        todo={deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(undefined);
          }
        }}
        onDeleted={handleDeleted}
      />
    </PageContainer>
  );
}

function TodoToggle({
  todo,
  pending,
  onToggle,
}: {
  readonly todo: Todo;
  readonly pending: boolean;
  readonly onToggle: (todo: Todo) => Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Button
      type='button'
      variant='ghost'
      size='icon-sm'
      className='rounded-full'
      aria-pressed={todo.completed}
      aria-label={
        todo.completed
          ? t('todos.actions.markIncomplete')
          : t('todos.actions.markComplete')
      }
      disabled={pending}
      onClick={() => {
        void onToggle(todo);
      }}
    >
      {pending ? (
        <Spinner className='size-4' />
      ) : todo.completed ? (
        <CircleCheckBigIcon
          className='size-4 text-(--status-success)'
          aria-hidden='true'
        />
      ) : (
        <CircleIcon
          className='size-4 text-muted-foreground'
          aria-hidden='true'
        />
      )}
    </Button>
  );
}

function TodoStatusBadge({ todo }: { readonly todo: Todo }): ReactElement {
  const { t } = useTranslation();
  const status = todoStatus(todo);
  const tone =
    status === 'completed'
      ? 'success'
      : status === 'expired'
        ? 'warning'
        : 'neutral';

  return <StatusBadge tone={tone}>{t(`todos.status.${status}`)}</StatusBadge>;
}

function TodoRowActions({
  todo,
  onDelete,
}: {
  readonly todo: Todo;
  readonly onDelete: (todo: Todo) => void;
}): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label={t('todos.actions.menu')}
          />
        }
      >
        <MoreHorizontalIcon aria-hidden='true' />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuItem
          render={
            <Link
              to={{
                pathname: `edit/${todo.id}`,
                search: location.search,
              }}
            />
          }
        >
          <PencilIcon aria-hidden='true' />
          {t('todos.actions.edit')}
        </DropdownMenuItem>
        <DropdownMenuItem variant='destructive' onClick={() => onDelete(todo)}>
          <Trash2Icon aria-hidden='true' />
          {t('todos.actions.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

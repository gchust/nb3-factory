import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  CheckIcon,
  ListTodoIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

import { TodoStatusBadge } from './status-badge.js';
import { TodoDeleteDialog } from './todo-delete-dialog.js';
import {
  isTodoStatusFilter,
  type Todo,
  type TodosOutletContext,
} from './types.js';

/** The page fetches sorted by creation time descending; the URL only carries the status filter. */
export default function TodosPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const toaster = useToaster();
  const location = useLocation();
  const statusTriggerRef = useRef<HTMLButtonElement>(null);

  // The status filter lives in the URL, so a refresh, going back or a shared link restores it.
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const status = isTodoStatusFilter(statusParam) ? statusParam : 'all';
  const filtered = status !== 'all';

  // The latest query parameters: those this page last wrote, or the router last updated.
  const paramsRef = useRef(searchParams);
  useEffect(() => {
    paramsRef.current = searchParams;
  }, [searchParams]);
  function updateParams(mutate: (params: URLSearchParams) => void): void {
    const next = new URLSearchParams(paramsRef.current);
    mutate(next);
    paramsRef.current = next;
    setSearchParams(next, { replace: true });
  }

  function changeStatus(value: string | null): void {
    updateParams((params) => {
      if (value === null || value === 'all') {
        params.delete('status');
      } else {
        params.set('status', value);
      }
    });
  }

  function clearFilters(): void {
    updateParams((params) => {
      params.delete('status');
    });
    statusTriggerRef.current?.focus();
  }

  const statusItems = [
    { value: 'all', label: t('todos.filters.allStatuses') },
    { value: 'active', label: t('todos.status.active') },
    { value: 'completed', label: t('todos.status.completed') },
  ];

  // `reload` keeps a stable reference, so child routes can depend on it (see table.md).
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([status, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Todo[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    // Abort the request when the filter changes or the component unmounts, so an old result never overwrites a new one.
    const controller = new AbortController();
    const key = JSON.stringify([status, reloadCount]);
    const query = status === 'all' ? '' : `?status=${status}`;
    api
      .request<{ data: Todo[] }>({
        path: `todos${query}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, rows: data });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setResult({ key, error });
        },
      );
    return () => controller.abort();
  }, [api, status, reloadCount]);

  // Keep the previous batch on screen while reloading or after a failure.
  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;

  const [deletion, setDeletion] = useState<{
    readonly open: boolean;
    readonly todo: Pick<Todo, 'id' | 'title'> | null;
  }>({ open: false, todo: null });

  const [togglingId, setTogglingId] = useState<number | null>(null);
  async function toggleComplete(todo: Todo): Promise<void> {
    setTogglingId(todo.id);
    try {
      await api.request({
        path: `todos/${todo.id}`,
        method: 'PATCH',
        json: { completed: !todo.completed },
      });
      toaster.show({
        type: 'success',
        title: todo.completed
          ? t('todos.toggle.active', { title: todo.title })
          : t('todos.toggle.completed', { title: todo.title }),
      });
      reload();
    } catch {
      toaster.show({
        type: 'error',
        title: t('todos.error.requestFailed'),
      });
    } finally {
      setTogglingId(null);
    }
  }

  // Format dates in the current language, so they update when the language switches.
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  const columns: ColumnDef<Todo>[] = [
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('todos.fields.title')}
        />
      ),
      cell: ({ row }) => (
        // The title opens the edit dialog and keeps the current filter.
        <Link
          to={{
            pathname: `${row.original.id}/edit`,
            search: location.search,
          }}
          className={cn(
            'font-medium hover:underline',
            row.original.completed && 'text-muted-foreground line-through',
          )}
        >
          {row.original.title}
        </Link>
      ),
    },
    {
      accessorKey: 'completed',
      enableSorting: false,
      header: t('todos.fields.status'),
      cell: ({ row }) => <TodoStatusBadge completed={row.original.completed} />,
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('todos.fields.createdAt')}
        />
      ),
      cell: ({ row }) => (
        <span className='whitespace-nowrap text-muted-foreground'>
          {dateFormat.format(new Date(row.original.createdAt))}
        </span>
      ),
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      header: () => <span className='sr-only'>{t('todos.actions.label')}</span>,
      cell: ({ row }) => (
        <div className='flex justify-end'>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label={t('todos.actions.more', {
                    title: row.original.title,
                  })}
                />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              {/* Edit is a child route: the menu item renders as a link. */}
              <DropdownMenuItem
                render={
                  <Link
                    to={{
                      pathname: `${row.original.id}/edit`,
                      search: location.search,
                    }}
                  />
                }
              >
                <PencilIcon />
                {t('todos.actions.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={togglingId === row.original.id}
                onClick={() => void toggleComplete(row.original)}
              >
                {row.original.completed ? <RotateCcwIcon /> : <CheckIcon />}
                {row.original.completed
                  ? t('todos.actions.markIncomplete')
                  : t('todos.actions.markComplete')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant='destructive'
                onClick={() => setDeletion({ open: true, todo: row.original })}
              >
                <Trash2Icon />
                {t('todos.actions.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  // Check in the order "failed → first load → empty → data or no results".
  let content: ReactElement;
  if (error) {
    // Retrying cannot succeed without permission, so offer no "Retry".
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('todos.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('todos.error.forbidden')
            : t('todos.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                reload();
                statusTriggerRef.current?.focus();
              }}
            >
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (rows === undefined) {
    content = <TableSkeleton label={t('status.loading')} />;
  } else if (rows.length === 0 && !filtered) {
    content = (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <ListTodoIcon />
          </EmptyMedia>
          <EmptyTitle>{t('todos.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('todos.empty.description')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {/* The page header already has the primary button, so use outline here. */}
          <Button
            variant='outline'
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('todos.create.action')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.id)}
        showSelectedCount={false}
        emptyMessage={
          <div className='flex flex-col items-center gap-2'>
            <span>{t('todos.empty.noResults')}</span>
            <Button variant='link' size='sm' onClick={clearFilters}>
              {t('todos.filters.clear')}
            </Button>
          </div>
        }
      />
    );
  }

  // Keep the reference stable: child routes depend on `reload`.
  const outletContext = useMemo<TodosOutletContext>(
    () => ({ reload }),
    [reload],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('todos.title')}
        description={t('todos.description')}
        actions={
          <Button
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('todos.create.action')}
          </Button>
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <Select items={statusItems} value={status} onValueChange={changeStatus}>
          <SelectTrigger
            ref={statusTriggerRef}
            className='w-44'
            aria-label={t('todos.filters.status')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtered ? (
          <Button variant='ghost' onClick={clearFilters}>
            {t('todos.filters.clear')}
          </Button>
        ) : null}
        {/* Reloading keeps the old data and shows only a small Spinner here. */}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}

      <TodoDeleteDialog
        open={deletion.open}
        onOpenChange={(open) =>
          setDeletion((current) => ({ ...current, open }))
        }
        todo={deletion.todo}
        onDeleted={() => {
          setDeletion((current) => ({ ...current, open: false }));
          reload();
        }}
        deletedFocusRef={statusTriggerRef}
      />

      {/* The create and edit child routes render here and get the list refresh function from context. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

function TableSkeleton({ label }: { readonly label: string }): ReactElement {
  return (
    <div
      role='status'
      aria-label={label}
      className='overflow-hidden rounded-lg border'
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className='flex items-center gap-4 border-b px-4 py-3 last:border-b-0'
        >
          <Skeleton className='h-4 w-40' />
          <Skeleton className='h-5 w-16 rounded-full' />
          <Skeleton className='ml-auto h-4 w-28' />
        </div>
      ))}
    </div>
  );
}

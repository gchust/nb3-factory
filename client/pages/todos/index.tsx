import type { ColumnDef } from '@tanstack/react-table';
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, RefreshCwIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';

import { DataTable } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Button } from '#components/ui/button';

import { todoStatus, type Todo, type TodoStatus } from './types.js';

const statusTone: Record<
  TodoStatus,
  'neutral' | 'info' | 'warning' | 'success'
> = {
  completed: 'success',
  expired: 'warning',
  overdue: 'warning',
  pending: 'info',
};

export default function TodosPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const [todos, setTodos] = useState<readonly Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [reloadCount, setReloadCount] = useState(0);

  const load = useCallback(
    (signal: AbortSignal) =>
      api.request<{ data: Todo[] }>({ path: 'todos', signal }),
    [api],
  );

  const refresh = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setReloadCount((count) => count + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void load(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setTodos(response.data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [load, reloadCount]);

  const formatDate = useCallback(
    (value: string) =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value)),
    [i18n.language],
  );

  const columns = useMemo<ColumnDef<Todo>[]>(
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
        cell: ({ row }) => formatDate(row.original.dueAt),
      },
      {
        accessorKey: 'completed',
        header: t('todos.columns.completed'),
        cell: ({ row }) =>
          row.original.completed ? t('todos.yes') : t('todos.no'),
      },
      {
        accessorKey: 'expired',
        header: t('todos.columns.expired'),
        cell: ({ row }) =>
          row.original.expired ? t('todos.yes') : t('todos.no'),
      },
      {
        id: 'status',
        header: t('todos.columns.status'),
        cell: ({ row }) => {
          const status = todoStatus(row.original);
          return (
            <StatusBadge tone={statusTone[status]} size='sm'>
              {t(`todos.status.${status}`)}
            </StatusBadge>
          );
        },
      },
    ],
    [formatDate, t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('todos.title')}
        description={t('todos.description')}
        actions={
          <Button variant='outline' disabled={loading} onClick={refresh}>
            <RefreshCwIcon className={loading ? 'animate-spin' : undefined} />
            {t('todos.refresh')}
          </Button>
        }
      />
      {error ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertTitle>{t('todos.loadFailed')}</AlertTitle>
          <AlertDescription>{t('todos.loadFailedHint')}</AlertDescription>
          <AlertAction>
            <Button variant='outline' size='sm' onClick={refresh}>
              {t('todos.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      <DataTable
        columns={columns}
        data={todos}
        getRowId={(todo) => todo.id}
        loading={loading}
        pagination={false}
        emptyMessage={t('todos.empty')}
      />
    </PageContainer>
  );
}

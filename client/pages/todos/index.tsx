import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  CalendarClockIcon,
  CheckCircle2Icon,
  ListTodoIcon,
  RefreshCwIcon,
} from 'lucide-react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Skeleton } from '#components/ui/skeleton';

interface Todo {
  readonly id: string;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
}

interface TodoList {
  readonly data: readonly Todo[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

function useTodos() {
  const api = useApiClient();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    readonly revision: number;
    readonly data?: TodoList;
    readonly error?: unknown;
  }>({ revision: -1 });
  useEffect(() => {
    let active = true;
    void api.request<TodoList>({ path: 'todos?page=1&pageSize=100' }).then(
      (data) => {
        if (active) setState({ revision, data });
      },
      (error: unknown) => {
        if (active) setState({ revision, error });
      },
    );
    return () => {
      active = false;
    };
  }, [api, revision]);
  return {
    data: state.revision === revision ? state.data : undefined,
    error: state.revision === revision ? state.error : undefined,
    loading: state.revision !== revision,
    reload: useCallback(() => setRevision((value) => value + 1), []),
  };
}

function formatDueAt(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

/** The todo list the scheduled expiry check operates on. */
export default function TodosPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const todos = useTodos();
  const rows = todos.data?.data ?? [];
  const expired = rows.filter((todo) => todo.expired).length;
  const completed = rows.filter((todo) => todo.completed).length;
  const status: unknown =
    todos.error && typeof todos.error === 'object'
      ? Reflect.get(todos.error, 'status')
      : undefined;

  return (
    <PageContainer>
      <PageHeader
        title={t('todos.title')}
        description={t('todos.description')}
        actions={
          <Button
            variant='outline'
            onClick={todos.reload}
            disabled={todos.loading}
          >
            <RefreshCwIcon />
            {t('todos.refresh')}
          </Button>
        }
      />
      {todos.error ? (
        <Alert variant='destructive'>
          <AlertDescription>
            {t(
              status === 401
                ? 'todos.sessionEnded'
                : status === 403
                  ? 'todos.denied'
                  : 'todos.failed',
            )}
            {status !== 401 && (
              <Button variant='outline' size='sm' onClick={todos.reload}>
                {t('todos.retry')}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      {todos.loading ? (
        <div aria-label={t('todos.loading')} className='flex flex-col gap-3'>
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-20 w-full' />
          <Skeleton className='h-20 w-full' />
        </div>
      ) : (
        !todos.error &&
        (rows.length ? (
          <>
            <div className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
              <span>{t('todos.total', { count: todos.data?.meta.total })}</span>
              <StatusBadge size='sm' tone={expired ? 'warning' : 'neutral'}>
                {t('todos.expiredCount', { count: expired })}
              </StatusBadge>
              <StatusBadge size='sm' tone='success'>
                {t('todos.completedCount', { count: completed })}
              </StatusBadge>
            </div>
            <div className='divide-y overflow-hidden rounded-xl border bg-card'>
              {rows.map((todo) => {
                const badge = todo.completed ? (
                  <StatusBadge size='sm' tone='success'>
                    {t('todos.completed')}
                  </StatusBadge>
                ) : todo.expired ? (
                  <StatusBadge size='sm' tone='warning'>
                    {t('todos.expired')}
                  </StatusBadge>
                ) : (
                  <StatusBadge size='sm' tone='info'>
                    {t('todos.pending')}
                  </StatusBadge>
                );
                return (
                  <div
                    key={todo.id}
                    className='flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between'
                  >
                    <div className='flex min-w-0 items-start gap-3'>
                      <div className='rounded-lg bg-primary/10 p-2 text-primary'>
                        {todo.completed ? (
                          <CheckCircle2Icon className='size-4' />
                        ) : (
                          <ListTodoIcon className='size-4' />
                        )}
                      </div>
                      <div className='min-w-0'>
                        <p className='font-medium'>{todo.title}</p>
                        <p className='mt-1 flex items-center gap-1.5 text-xs text-muted-foreground'>
                          <CalendarClockIcon className='size-3.5' />
                          {t('todos.dueAt')}:{' '}
                          {formatDueAt(todo.dueAt, i18n.language)}
                        </p>
                      </div>
                    </div>
                    <div className='flex shrink-0 items-center gap-2'>
                      {badge}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className='text-xs text-muted-foreground'>
              {t('todos.expiryHint')}
            </p>
          </>
        ) : (
          <Empty className='min-h-48 border border-dashed'>
            <EmptyMedia variant='icon'>
              <ListTodoIcon />
            </EmptyMedia>
            <EmptyTitle>{t('todos.empty')}</EmptyTitle>
            <EmptyDescription>{t('todos.emptyHint')}</EmptyDescription>
          </Empty>
        ))
      )}
    </PageContainer>
  );
}

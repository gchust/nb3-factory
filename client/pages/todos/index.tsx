'use client';

import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, ListTodoIcon, PlusIcon } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactElement,
} from 'react';
import { Link, Outlet } from 'react-router';

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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Skeleton } from '#components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { ToggleCompletedButton } from './toggle-completed-button.js';
import type { Todo, TodoList, TodosOutletContext } from './types.js';

// The endpoint caps a page at 100 records. This page shows them all and says so when more exist; it is a
// verification page, not a list that needs server pagination.
const PAGE_SIZE = 100;

/**
 * The todo list: the application's only page for watching the overdue check work. Its rows show exactly the four
 * fields the schedule uses — title, deadline, completed, expired — and a single action toggles completion.
 */
export default function TodosPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = String(reloadCount);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly todos?: Todo[];
    readonly total?: number;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    // Abort the request when the component unmounts, so an old result never overwrites a new one.
    const controller = new AbortController();
    const key = String(reloadCount);
    api
      .request<TodoList>({
        path: 'todos',
        query: { pageSize: PAGE_SIZE },
        signal: controller.signal,
      })
      .then(
        ({ data, meta }) => {
          if (!controller.signal.aborted) {
            setResult({ key, todos: data, total: meta.total });
          }
        },
        (error: unknown) => {
          // Keep the previous rows on failure: after "Retry", the old data stays and only the alert appears.
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, reloadCount]);

  // "Loading" is derived: a result that is not from the current request is still loading.
  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const todos = result?.todos;
  const total = result?.total ?? todos?.length ?? 0;

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  // Keep the context passed to the create dialog stable, so effects that depend on it do not run again and again.
  const outletContext = useMemo<TodosOutletContext>(
    () => ({ reload }),
    [reload],
  );

  /** Updates the changed row in place so the table never shows a stale value while the list refreshes. */
  function replaceTodo(todo: Todo | undefined): void {
    if (!todo) {
      reload();
      return;
    }
    setResult((previous) =>
      previous?.todos
        ? {
            ...previous,
            todos: previous.todos.map((row) =>
              row.id === todo.id ? todo : row,
            ),
          }
        : previous,
    );
  }

  const newTodoButton = (
    <Button render={<Link to='new' />}>
      <PlusIcon />
      {t('todos.new')}
    </Button>
  );

  // Check in the order "session → failed → first load → empty → data".
  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('todos.error.title')}</AlertTitle>
        <AlertDescription>{t('todos.error.sessionExpired')}</AlertDescription>
      </Alert>
    );
  } else if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <ListTodoIcon />
        <AlertTitle>{t('todos.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('todos.error.forbidden')
            : t('todos.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (todos === undefined) {
    content = (
      <div className='space-y-2 rounded-lg border border-border p-4'>
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-8 w-full' />
        <span className='sr-only'>{t('status.loading')}</span>
      </div>
    );
  } else if (todos.length === 0) {
    content = (
      <Empty className='min-h-48 border border-dashed'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <ListTodoIcon />
          </EmptyMedia>
          <EmptyTitle>{t('todos.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('todos.empty.description')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>{newTodoButton}</EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <div className='space-y-3'>
        <div className='rounded-lg border border-border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('todos.table.title')}</TableHead>
                <TableHead>{t('todos.table.dueAt')}</TableHead>
                <TableHead>{t('todos.table.completed')}</TableHead>
                <TableHead>{t('todos.table.expired')}</TableHead>
                <TableHead>
                  <span className='sr-only'>{t('todos.table.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {todos.map((todo) => (
                <TableRow key={todo.id}>
                  <TableCell className='font-medium'>{todo.title}</TableCell>
                  <TableCell className='whitespace-nowrap text-muted-foreground'>
                    {dateFormat.format(new Date(todo.dueAt))}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={todo.completed ? 'success' : 'neutral'}>
                      {todo.completed
                        ? t('todos.value.completed')
                        : t('todos.value.open')}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={todo.expired ? 'warning' : 'neutral'}>
                      {todo.expired
                        ? t('todos.value.expired')
                        : t('todos.value.notExpired')}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className='text-right'>
                    <ToggleCompletedButton
                      todo={todo}
                      onToggled={replaceTodo}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {total > todos.length ? (
          <p className='text-sm text-muted-foreground'>
            {t('todos.capNotice', { shown: todos.length, total })}
          </p>
        ) : null}
        <p className='text-sm text-muted-foreground'>
          {t('todos.rule')}{' '}
          <Button variant='link' render={<Link to='/scheduler' />}>
            {t('todos.viewSchedules')}
          </Button>
        </p>
      </div>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('todos.title')}
        description={t('todos.description')}
        // While the list is empty its own primary action is the only one, so the header leaves it out (guideline L7).
        actions={todos && todos.length > 0 ? newTodoButton : undefined}
      />
      {content}
      {/* The create dialog is this page's child route. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { RefreshCwIcon } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';

import { Loading } from '#components/loading';
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
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

/** One todo as the API returns it. */
interface Todo {
  readonly id: string;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
}

interface TodoList {
  readonly data: readonly Todo[];
  readonly meta: { readonly total: number };
}

/**
 * Route `/todos`: the minimal todo page.
 *
 * One table, the four columns the feature is about — title, due time, completed, expired. It is deliberately
 * read-only: `expired` is only ever set by the "check expired todos" schedule, and the three state combinations the
 * schedule has to distinguish (past due and open, still in the future, done before it fell due) are what the page
 * exists to show. The API supports creating, editing and deleting a todo; a form for it was left out of this small
 * build and can be added without touching the schedule.
 */
export default function TodosPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly todos?: readonly Todo[];
    readonly error?: unknown;
  }>();

  const requestKey = String(reloadCount);
  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    api
      .request<TodoList>({
        path: 'todos',
        query: { pageSize: 100 },
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) {
            setResult({ key, todos: data });
          }
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  // Keep the last good batch on screen while a reload is in flight.
  const todos = result?.todos;

  const formatDate = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  const formatDue = (value: string): string =>
    formatDate.format(new Date(value));

  return (
    <PageContainer className='mx-auto max-w-4xl'>
      <PageHeader
        title={t('todos.title')}
        description={t('todos.description')}
        actions={
          <Button variant='outline' onClick={() => reload()}>
            <RefreshCwIcon data-icon='inline-start' />
            {t('todos.refresh')}
          </Button>
        }
      />
      {loading && !todos ? (
        <Loading label={t('todos.loading')} />
      ) : error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('todos.loadErrorTitle')}</AlertTitle>
          <AlertDescription>{t('todos.loadErrorDescription')}</AlertDescription>
          <AlertAction>
            <Button variant='outline' size='sm' onClick={() => reload()}>
              {t('todos.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : todos && todos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('todos.emptyTitle')}</EmptyTitle>
            <EmptyDescription>{t('todos.emptyDescription')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('todos.columns.title')}</TableHead>
              <TableHead>{t('todos.columns.dueAt')}</TableHead>
              <TableHead>{t('todos.columns.completed')}</TableHead>
              <TableHead>{t('todos.columns.expired')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(todos ?? []).map((todo) => (
              <TableRow key={todo.id}>
                <TableCell className='font-medium'>{todo.title}</TableCell>
                <TableCell className='text-muted-foreground'>
                  {formatDue(todo.dueAt)}
                </TableCell>
                <TableCell>
                  <StatusBadge tone={todo.completed ? 'success' : 'neutral'}>
                    {todo.completed
                      ? t('todos.completed.yes')
                      : t('todos.completed.no')}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  <StatusBadge tone={todo.expired ? 'warning' : 'neutral'}>
                    {todo.expired
                      ? t('todos.expired.yes')
                      : t('todos.expired.no')}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </PageContainer>
  );
}

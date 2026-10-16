import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { RefreshCwIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription } from '#components/ui/alert';
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

/** A row of the `todos` collection, as `GET /api/todos` returns it (`server/routes/schemas.ts`). */
interface Todo {
  readonly id: number;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
}

/**
 * The todo list, read-only: the scheduling task `todos.check-expired` is what sets `expired`, so the page only shows
 * the four fields the task maintains and lets the user reload them.
 */
export default function TodosPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Todo[];
    readonly error?: unknown;
  }>();

  // Load the list. The result belongs to a request key, so a stale response never overwrites a newer one; the
  // request is aborted when the page unmounts or the count changes.
  const requestKey = String(reloadCount);
  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    api
      .request<{ data: Todo[] }>({ path: 'todos', signal: controller.signal })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, rows: data });
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
  const rows = result?.rows;
  const error = loading ? undefined : result?.error;

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button
            disabled={loading}
            onClick={() => setReloadCount((count) => count + 1)}
            size='sm'
            variant='outline'
          >
            <RefreshCwIcon />
            {t('todos.refresh')}
          </Button>
        }
        description={t('todos.description')}
        title={t('todos.title')}
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <Alert variant='destructive'>
          <AlertDescription>{t('todos.loadFailed')}</AlertDescription>
        </Alert>
      ) : rows && rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('todos.column.title')}</TableHead>
              <TableHead>{t('todos.column.dueAt')}</TableHead>
              <TableHead>{t('todos.column.completed')}</TableHead>
              <TableHead>{t('todos.column.expired')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((todo) => (
              <TableRow key={todo.id}>
                <TableCell className='font-medium'>{todo.title}</TableCell>
                <TableCell className='text-muted-foreground'>
                  {dateFormat.format(new Date(todo.dueAt))}
                </TableCell>
                <TableCell>
                  <StatusBadge tone={todo.completed ? 'success' : 'neutral'}>
                    {todo.completed ? t('todos.yes') : t('todos.no')}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  <StatusBadge tone={todo.expired ? 'warning' : 'neutral'}>
                    {todo.expired ? t('todos.yes') : t('todos.no')}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('todos.empty')}</EmptyTitle>
            <EmptyDescription>{t('todos.emptyDescription')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </PageContainer>
  );
}

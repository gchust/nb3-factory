import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { RefreshCwIcon } from 'lucide-react';
import { type ReactElement } from 'react';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import { Card, CardContent } from '#components/ui/card';
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

/** One todo as `GET /api/todos` returns it. */
interface TodoItem {
  readonly id: number;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly overdue: boolean;
}

interface TodoListResponse {
  readonly data: readonly TodoItem[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

/**
 * Route `/todos`: the single table the overdue schedule acts on. Read-only on purpose — the page shows what the
 * schedule changed, and the schedule is the only writer of the `overdue` flag.
 */
export default function TodosPage(): ReactElement {
  const api = useApiClient();
  const { t, i18n } = useTranslation();

  const query = useQuery({
    queryKey: ['todos', 'list'],
    queryFn: ({ signal }) =>
      api.request<TodoListResponse>({
        path: 'todos',
        query: { page: 1, pageSize: 100 },
        signal,
      }),
  });

  const items = query.data?.data ?? [];
  const formatDate = (value: string): string =>
    new Date(value).toLocaleString(i18n.language);

  return (
    <PageContainer>
      <PageHeader
        title={t('todos.title')}
        description={t('todos.description')}
        actions={
          <Button
            variant='outline'
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCwIcon
              data-icon='inline-start'
              className={query.isFetching ? 'animate-spin' : undefined}
            />
            {t('todos.refresh')}
          </Button>
        }
      />

      <Card>
        <CardContent>
          {query.isPending ? (
            <Loading className='py-12' />
          ) : query.isError ? (
            <Empty className='min-h-48'>
              <EmptyHeader>
                <EmptyTitle>{t('todos.errorTitle')}</EmptyTitle>
                <EmptyDescription>
                  {t('todos.errorDescription')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : items.length === 0 ? (
            <Empty className='min-h-48'>
              <EmptyHeader>
                <EmptyTitle>{t('todos.empty')}</EmptyTitle>
                <EmptyDescription>
                  {t('todos.emptyDescription')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('todos.columns.title')}</TableHead>
                  <TableHead>{t('todos.columns.dueAt')}</TableHead>
                  <TableHead>{t('todos.columns.completed')}</TableHead>
                  <TableHead>{t('todos.columns.overdue')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((todo) => (
                  <TableRow key={todo.id}>
                    <TableCell className='font-medium'>{todo.title}</TableCell>
                    <TableCell className='text-muted-foreground'>
                      {formatDate(todo.dueAt)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={todo.completed ? 'success' : 'neutral'}
                      >
                        {todo.completed
                          ? t('todos.completed')
                          : t('todos.pending')}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={todo.overdue ? 'warning' : 'neutral'}>
                        {todo.overdue ? t('todos.overdue') : t('todos.onTime')}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

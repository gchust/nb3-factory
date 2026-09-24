import {
  apiClientToken,
  useService,
  type ApiClient,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { CircleAlert, RefreshCw } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { Loading } from '@/components/loading';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Todo {
  readonly id: number;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly overdue: boolean;
}

function requestTodos(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<{ data: readonly Todo[] }> {
  return api.request<{ data: readonly Todo[] }>({ path: 'todos', signal });
}

/**
 * A deliberately small screen: it exists so the scheduled overdue check has a
 * visible result. Every value here is read from `GET /api/todos`; the page
 * never writes, because `overdue` is owned by the Scheduler target.
 */
export default function TodosPage(): ReactElement {
  const api = useService(apiClientToken);
  const { i18n, t } = useTranslation();
  const [todos, setTodos] = useState<readonly Todo[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const response = await requestTodos(api, controller.signal);
        if (active) {
          setTodos(response.data);
        }
      } catch (cause: unknown) {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : t('todos.loadFailed'),
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, t]);

  const refresh = (): void => {
    setError(undefined);
    setLoading(true);
    void (async () => {
      try {
        const response = await requestTodos(api);
        setTodos(response.data);
      } catch (cause: unknown) {
        setError(
          cause instanceof Error ? cause.message : t('todos.loadFailed'),
        );
      } finally {
        setLoading(false);
      }
    })();
  };

  const status = (todo: Todo): ReactElement => {
    if (todo.completed) {
      return <Badge variant='secondary'>{t('todos.status.completed')}</Badge>;
    }
    if (todo.overdue) {
      return <Badge variant='destructive'>{t('todos.status.overdue')}</Badge>;
    }
    return <Badge variant='outline'>{t('todos.status.open')}</Badge>;
  };

  const locale = i18n.resolvedLanguage ?? i18n.language;
  const formatDueAt = (value: string): string =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button disabled={loading} onClick={refresh} variant='outline'>
            <RefreshCw data-icon='inline-start' />
            {t('todos.refresh')}
          </Button>
        }
        description={t('todos.description')}
        title={t('todos.title')}
      />

      {error ? (
        <div className='flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive'>
          <CircleAlert className='size-5 shrink-0' />
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('todos.title')}</CardTitle>
          <CardDescription>{t('todos.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loading />
          ) : todos.length === 0 ? (
            <p className='text-sm text-muted-foreground'>{t('todos.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('todos.columns.title')}</TableHead>
                  <TableHead>{t('todos.columns.dueAt')}</TableHead>
                  <TableHead>{t('todos.columns.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {todos.map((todo) => (
                  <TableRow key={todo.id}>
                    <TableCell className='font-medium'>{todo.title}</TableCell>
                    <TableCell className='text-muted-foreground'>
                      {formatDueAt(todo.dueAt)}
                    </TableCell>
                    <TableCell>{status(todo)}</TableCell>
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

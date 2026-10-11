import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useCallback, useEffect, useState } from 'react';

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
import { Spinner } from '#components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { listTodos, updateTodo } from './api.js';
import { todoStatus, type Todo, type TodoStatus } from './types.js';

interface LoadedTodos {
  readonly key: string;
  readonly todos?: readonly Todo[];
  readonly error?: unknown;
}

export default function TodosPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<LoadedTodos>();
  const [pendingId, setPendingId] = useState<string>();

  const requestKey = String(reloadCount);

  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    listTodos(api, controller.signal).then(
      (todos) => {
        if (!controller.signal.aborted) setResult({ key, todos });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  const toggleCompleted = useCallback(
    (todo: Todo): void => {
      const completed = !todo.completed;
      setPendingId(todo.id);
      updateTodo(api, todo.id, completed)
        .then(
          (updated) => {
            setResult((current) =>
              current?.todos
                ? {
                    ...current,
                    todos: current.todos.map((item) =>
                      item.id === updated.id ? updated : item,
                    ),
                  }
                : current,
            );
            toaster.show({
              type: 'success',
              title: t(
                completed ? 'todos.toast.completed' : 'todos.toast.reopened',
                { title: todo.title },
              ),
            });
          },
          (error: unknown) => {
            toaster.show({
              type: 'error',
              title: t('todos.toast.failed'),
              description: describeError(error) ?? t('todos.error.unknown'),
            });
          },
        )
        .finally(() => setPendingId(undefined));
    },
    [api, t, toaster],
  );

  const loading = result?.key !== requestKey;
  const todos = result?.key === requestKey ? result.todos : undefined;

  return (
    <PageContainer>
      <PageHeader
        title={t('todos.title')}
        description={t('todos.description')}
        actions={
          <Button
            variant='outline'
            size='sm'
            onClick={reload}
            disabled={loading}
          >
            {loading ? <Spinner /> : null}
            {t('todos.refresh')}
          </Button>
        }
      />

      {loading ? (
        <Loading label={t('todos.loading')} />
      ) : result?.error ? (
        <RequestFailedAlert error={result.error} onRetry={reload} />
      ) : todos && todos.length > 0 ? (
        <TodosTable
          todos={todos}
          language={i18n.language}
          pendingId={pendingId}
          onToggle={toggleCompleted}
        />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('todos.empty.title')}</EmptyTitle>
            <EmptyDescription>{t('todos.empty.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </PageContainer>
  );
}

interface TodosTableProps {
  readonly todos: readonly Todo[];
  readonly language: string;
  readonly pendingId?: string;
  readonly onToggle: (todo: Todo) => void;
}

function TodosTable({
  todos,
  language,
  pendingId,
  onToggle,
}: TodosTableProps): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='rounded-lg border border-border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('todos.columns.title')}</TableHead>
            <TableHead>{t('todos.columns.dueAt')}</TableHead>
            <TableHead>{t('todos.columns.status')}</TableHead>
            <TableHead className='text-right'>
              {t('todos.columns.actions')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {todos.map((todo) => {
            const status = todoStatus(todo);
            return (
              <TableRow key={todo.id}>
                <TableCell className='font-medium'>{todo.title}</TableCell>
                <TableCell className='text-muted-foreground'>
                  {formatDateTime(todo.dueAt, language)}
                </TableCell>
                <TableCell>
                  <StatusBadge tone={STATUS_TONES[status]}>
                    {t(`todos.status.${status}`)}
                  </StatusBadge>
                </TableCell>
                <TableCell className='text-right'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => onToggle(todo)}
                    disabled={pendingId === todo.id}
                  >
                    {pendingId === todo.id ? <Spinner /> : null}
                    {todo.completed
                      ? t('todos.action.reopen')
                      : t('todos.action.complete')}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

interface RequestFailedAlertProps {
  readonly error: unknown;
  readonly onRetry: () => void;
}

function RequestFailedAlert({
  error,
  onRetry,
}: RequestFailedAlertProps): ReactElement {
  const { t } = useTranslation();
  const denied = error instanceof ApiClientError && error.status === 403;
  return (
    <Alert variant='destructive'>
      <AlertTitle>
        {denied ? t('todos.error.deniedTitle') : t('todos.error.title')}
      </AlertTitle>
      <AlertDescription>
        {denied
          ? t('todos.error.deniedDescription')
          : (describeError(error) ?? t('todos.error.unknown'))}
      </AlertDescription>
      <AlertAction>
        <Button variant='outline' size='sm' onClick={onRetry}>
          {t('todos.error.retry')}
        </Button>
      </AlertAction>
    </Alert>
  );
}

const STATUS_TONES: Record<TodoStatus, 'success' | 'warning' | 'info'> = {
  completed: 'success',
  expired: 'warning',
  pending: 'info',
};

function formatDateTime(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function describeError(error: unknown): string | undefined {
  if (error instanceof ApiClientError) {
    return error.reason || error.message;
  }
  return undefined;
}

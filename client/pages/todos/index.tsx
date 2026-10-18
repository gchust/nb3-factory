import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { CheckIcon, ListTodoIcon, PlusIcon, RefreshCwIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Loading } from '#components/loading';
import { Spinner } from '#components/ui/spinner';
import { cn } from 'cn';

import { useDateFormat } from '#hooks/use-date-format';

import { fetchTodos, setTodoCompleted } from './api.js';
import type { Todo, TodoList, TodoOutletContext } from './types.js';

/**
 * The todo list, and the evidence of what the "check expired todos" schedule did.
 *
 * `expired` is written by nothing here: it is the schedule's own mark, so a row the schedule has not reached keeps
 * showing 待办中 however long the page stays open. The list therefore reloads on demand (the refresh button) rather
 * than pretending to know when the sweep last ran.
 */
export default function TodosPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { formatDateTime } = useDateFormat();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = String(reloadCount);
  // Every result carries the key of the request that produced it, so "loading" is derived instead of set.
  const [result, setResult] = useState<{
    readonly key: string;
    readonly list?: TodoList;
    readonly error?: unknown;
  }>();
  // Rows the user has just toggled; a reload replaces them with what the server says.
  const [todos, setTodos] = useState<readonly Todo[]>([]);
  const [pendingId, setPendingId] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    fetchTodos(api, controller.signal).then(
      (list) => {
        if (controller.signal.aborted) return;
        setResult({ key: String(reloadCount), list });
        setTodos(list.data);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key: String(reloadCount), error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);
  const loading = result?.key !== requestKey;
  const list = result?.list;
  const error = loading ? undefined : result?.error;

  const toggle = async (todo: Todo): Promise<void> => {
    setPendingId(todo.id);
    try {
      const updated = await setTodoCompleted(api, todo.id, !todo.completed);
      setTodos((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      );
    } catch (cause) {
      void toaster.show({
        type: 'error',
        title:
          cause instanceof ApiClientError && cause.status === 403
            ? t('todos.updateForbidden')
            : t('todos.updateFailed'),
      });
    } finally {
      setPendingId(undefined);
    }
  };

  const outletContext: TodoOutletContext = { reload };

  return (
    <PageContainer className='mx-auto max-w-4xl'>
      <PageHeader
        title={t('todos.title')}
        description={t('todos.description')}
        actions={
          <>
            <Button
              variant='ghost'
              size='icon'
              onClick={reload}
              disabled={loading}
              aria-label={t('todos.refresh')}
              title={t('todos.refresh')}
            >
              {loading ? <Spinner /> : <RefreshCwIcon />}
            </Button>
            {/* L7: while the list is empty the empty state carries the only primary action. */}
            {todos.length > 0 ? (
              <Button render={<Link to='new' />}>
                <PlusIcon data-icon='inline-start' />
                {t('todos.createAction')}
              </Button>
            ) : null}
          </>
        }
      />

      {error ? (
        <TodoError error={error} onRetry={reload} retrying={loading} />
      ) : loading && !list ? (
        <Loading className='py-24' label={t('todos.loading')} />
      ) : todos.length === 0 ? (
        <Empty className='min-h-48 border border-dashed'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <ListTodoIcon />
            </EmptyMedia>
            <EmptyTitle>{t('todos.empty.title')}</EmptyTitle>
            <EmptyDescription>{t('todos.empty.description')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link to='new' />}>
              <PlusIcon data-icon='inline-start' />
              {t('todos.createAction')}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ul className='divide-y divide-border overflow-hidden rounded-xl border border-border bg-card'>
          {todos.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              dueLabel={formatDateTime(todo.dueAt)}
              pending={pendingId === todo.id}
              disabled={pendingId !== undefined && pendingId !== todo.id}
              onToggle={() => void toggle(todo)}
            />
          ))}
        </ul>
      )}

      <Outlet context={outletContext} />
    </PageContainer>
  );
}

function TodoRow({
  todo,
  dueLabel,
  pending,
  disabled,
  onToggle,
}: {
  readonly todo: Todo;
  readonly dueLabel: string;
  readonly pending: boolean;
  readonly disabled: boolean;
  readonly onToggle: () => void;
}): ReactElement {
  const { t } = useTranslation();

  return (
    <li className='flex flex-wrap items-center justify-between gap-3 px-4 py-3'>
      <div className='flex min-w-0 flex-col gap-1.5'>
        <span
          className={cn(
            'truncate font-medium',
            todo.completed && 'text-muted-foreground line-through',
          )}
        >
          {todo.title}
        </span>
        <span className='text-sm text-muted-foreground'>
          {t('todos.dueAt', { date: dueLabel })}
        </span>
        <div className='flex flex-wrap items-center gap-1.5'>
          {todo.completed ? (
            <StatusBadge tone='success'>
              {t('todos.status.completed')}
            </StatusBadge>
          ) : null}
          {todo.expired ? (
            <StatusBadge tone='warning'>
              {t('todos.status.expired')}
            </StatusBadge>
          ) : null}
          {!todo.completed && !todo.expired ? (
            <StatusBadge tone='info'>{t('todos.status.open')}</StatusBadge>
          ) : null}
        </div>
      </div>
      <Button
        variant='ghost'
        size='sm'
        onClick={onToggle}
        disabled={pending || disabled}
        aria-busy={pending}
      >
        {pending ? (
          <Spinner />
        ) : todo.completed ? null : (
          <CheckIcon data-icon='inline-start' />
        )}
        {todo.completed ? t('todos.reopen') : t('todos.complete')}
      </Button>
    </li>
  );
}

/** What happened, and what the reader can do about it, without repeating the server's message to them. */
function TodoError({
  error,
  onRetry,
  retrying,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly retrying: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const denied = error instanceof ApiClientError && error.status === 403;
  const title = denied ? t('todos.error.forbidden') : t('todos.error.title');
  const description = denied
    ? t('todos.error.forbiddenDescription')
    : t('todos.error.description');

  return (
    <div className='flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center'>
      <p className='font-medium'>{title}</p>
      <p className='max-w-md text-sm text-muted-foreground'>{description}</p>
      {denied ? null : (
        <Button variant='outline' onClick={onRetry} disabled={retrying}>
          {retrying ? <Spinner /> : null}
          {t('todos.error.retry')}
        </Button>
      )}
    </div>
  );
}

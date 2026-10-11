import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import { cn } from 'cn';

interface Todo {
  readonly id: number;
  readonly title: string;
  readonly dueAt: string;
  readonly completed: boolean;
  readonly expired: boolean;
}

/**
 * Route `/todos`: the smallest list that lets a reviewer see what the scheduled "检查过期待办" task did.
 *
 * It is deliberately read-mostly. The three rows come from the seed, so there is no create form; the only edit is
 * completing a todo, and the only field the schedule maintains, `expired`, is never edited here.
 */
export default function TodosPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const client = useApiClient();
  const [todos, setTodos] = useState<readonly Todo[]>();
  const [failed, setFailed] = useState(false);
  const [pendingId, setPendingId] = useState<number>();
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    client
      .request<{ data: Todo[] }>({ path: 'todos', signal: controller.signal })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) {
            setTodos(data);
            setFailed(false);
          }
        },
        () => {
          if (!controller.signal.aborted) setFailed(true);
        },
      );
    return () => controller.abort();
  }, [client, reloadToken]);

  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  async function toggle(todo: Todo): Promise<void> {
    setPendingId(todo.id);
    try {
      const { data } = await client.request<{ data: Todo }>({
        path: `todos/${todo.id}`,
        method: 'PATCH',
        json: { completed: !todo.completed },
      });
      setTodos((current) =>
        current?.map((item) => (item.id === data.id ? data : item)),
      );
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setPendingId(undefined);
    }
  }

  let content: ReactElement;
  if (!todos && failed) {
    content = (
      <div className='flex items-center gap-3'>
        <p role='alert' className='text-sm text-destructive'>
          {t('todos.error.failed')}
        </p>
        <Button
          variant='outline'
          size='sm'
          onClick={() => setReloadToken((value) => value + 1)}
        >
          {t('status.retry')}
        </Button>
      </div>
    );
  } else if (!todos) {
    content = (
      <p role='status' className='text-sm text-muted-foreground'>
        {t('status.loading')}
      </p>
    );
  } else if (todos.length === 0) {
    content = (
      <p className='text-sm text-muted-foreground'>{t('todos.empty')}</p>
    );
  } else {
    content = (
      <ul className='divide-y divide-border rounded-xl ring-1 ring-foreground/10'>
        {failed ? (
          <li className='p-4'>
            <p role='alert' className='text-sm text-destructive'>
              {t('todos.error.failed')}
            </p>
          </li>
        ) : null}
        {todos.map((todo) => (
          <li
            key={todo.id}
            className='flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between'
          >
            <div className='min-w-0'>
              <p
                className={cn(
                  'font-medium',
                  todo.completed && 'text-muted-foreground line-through',
                )}
              >
                {todo.title}
              </p>
              <p className='mt-1 text-sm text-muted-foreground'>
                {t('todos.dueAt', {
                  value: dateFormat.format(new Date(todo.dueAt)),
                })}
              </p>
            </div>
            <div className='flex shrink-0 items-center gap-2'>
              <StatusBadge tone={todo.completed ? 'success' : 'neutral'}>
                {todo.completed
                  ? t('todos.status.completed')
                  : t('todos.status.pending')}
              </StatusBadge>
              {todo.expired ? (
                <StatusBadge tone='warning'>
                  {t('todos.status.expired')}
                </StatusBadge>
              ) : null}
              <Button
                variant='outline'
                size='sm'
                disabled={pendingId === todo.id}
                onClick={() => void toggle(todo)}
              >
                {todo.completed
                  ? t('todos.action.markPending')
                  : t('todos.action.markCompleted')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('todos.title')}
        description={t('todos.description')}
      />
      {content}
    </PageContainer>
  );
}

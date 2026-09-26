import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, ListTodoIcon, PlusIcon } from 'lucide-react';
import { type FormEvent, type ReactElement, useEffect, useState } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';

interface Todo {
  readonly id: number;
  readonly title: string;
  readonly completed: boolean;
  readonly createdAt: string;
}

interface ListResult {
  readonly key: string;
  readonly todos?: readonly Todo[];
  readonly error?: unknown;
}

/** A personal To-do list: add an item, then check it off when it is done. */
export default function TodosPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `list:${reloadCount}`;
  const [result, setResult] = useState<ListResult>();

  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(
    () => new Set(),
  );

  useEffect(() => {
    const controller = new AbortController();
    const key = `list:${reloadCount}`;
    api
      .request<{ data: Todo[] }>({ path: 'todos', signal: controller.signal })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, todos: data });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setResult({ key, error });
        },
      );
    return () => controller.abort();
  }, [api, reloadCount]);

  // The result belongs to the request that produced it; anything else is still loading.
  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const todos = result?.todos;

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  async function addTodo(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError(t('todos.validation.titleRequired'));
      return;
    }
    setTitleError(undefined);
    setSubmitting(true);
    try {
      const { data } = await api.request<{ data: Todo }>({
        path: 'todos',
        method: 'POST',
        json: { title: trimmed },
      });
      setResult((previous) =>
        previous?.todos
          ? { key: previous.key, todos: [data, ...previous.todos] }
          : previous,
      );
      setTitle('');
      toast.add({ type: 'success', title: t('todos.created') });
    } catch {
      toast.add({
        type: 'error',
        priority: 'high',
        title: t('todos.createFailed'),
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleTodo(todo: Todo, completed: boolean): Promise<void> {
    setPendingIds((previous) => new Set(previous).add(todo.id));
    try {
      const { data } = await api.request<{ data: Todo }>({
        path: `todos/${todo.id}`,
        method: 'PATCH',
        json: { completed },
      });
      setResult((previous) =>
        previous?.todos
          ? {
              key: previous.key,
              todos: previous.todos.map((item) =>
                item.id === data.id ? data : item,
              ),
            }
          : previous,
      );
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 404) {
        // The record is gone; reload so the list stops showing it.
        setReloadCount((count) => count + 1);
      }
      toast.add({
        type: 'error',
        priority: 'high',
        title: t('todos.updateFailed'),
      });
    } finally {
      setPendingIds((previous) => {
        const next = new Set(previous);
        next.delete(todo.id);
        return next;
      });
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('todos.title')}
        description={t('todos.description')}
      />

      <Card>
        <CardContent>
          <form
            className='flex flex-col gap-2 sm:flex-row sm:items-start'
            onSubmit={(event) => {
              void addTodo(event);
            }}
            noValidate
          >
            <div className='flex-1 space-y-2'>
              <label htmlFor='todo-title' className='sr-only'>
                {t('todos.titleLabel')}
              </label>
              <Input
                id='todo-title'
                value={title}
                placeholder={t('todos.addPlaceholder')}
                aria-invalid={titleError ? true : undefined}
                aria-describedby={titleError ? 'todo-title-error' : undefined}
                maxLength={255}
                onChange={(event) => {
                  setTitle(event.target.value);
                  if (titleError) setTitleError(undefined);
                }}
              />
              {titleError ? (
                <p
                  id='todo-title-error'
                  role='alert'
                  className='text-sm text-destructive'
                >
                  {titleError}
                </p>
              ) : null}
            </div>
            <Button type='submit' disabled={submitting}>
              {submitting ? (
                <Spinner data-icon='inline-start' />
              ) : (
                <PlusIcon data-icon='inline-start' />
              )}
              {t('todos.addButton')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>{t('todos.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setReloadCount((count) => count + 1)}
            >
              {t('status.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : loading ? (
        <div
          role='status'
          aria-label={t('status.loading')}
          className='flex items-center gap-2 text-sm text-muted-foreground'
        >
          <Spinner />
          {t('status.loading')}
        </div>
      ) : todos && todos.length > 0 ? (
        <Card>
          <CardContent>
            <ul className='divide-y divide-border'>
              {todos.map((todo) => {
                const pending = pendingIds.has(todo.id);
                return (
                  <li
                    key={todo.id}
                    className='flex items-start gap-3 py-3 first:pt-0 last:pb-0'
                  >
                    <Checkbox
                      className='mt-0.5'
                      checked={todo.completed}
                      disabled={pending}
                      aria-label={t('todos.toggle', { title: todo.title })}
                      onCheckedChange={(checked) => {
                        void toggleTodo(todo, checked);
                      }}
                    />
                    <div className='min-w-0 flex-1'>
                      <p
                        className={
                          todo.completed
                            ? 'text-sm text-muted-foreground line-through'
                            : 'text-sm'
                        }
                      >
                        {todo.title}
                      </p>
                      <p className='mt-1 text-xs text-muted-foreground'>
                        {t('todos.createdAt', {
                          date: dateFormatter.format(new Date(todo.createdAt)),
                        })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <ListTodoIcon />
            </EmptyMedia>
            <EmptyTitle>{t('todos.emptyTitle')}</EmptyTitle>
            <EmptyDescription>{t('todos.emptyDescription')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </PageContainer>
  );
}

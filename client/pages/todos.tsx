import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, ListTodoIcon, PlusIcon } from 'lucide-react';
import {
  type FormEvent,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';

interface Todo {
  readonly id: number;
  readonly title: string;
  readonly completed: boolean;
  readonly createdAt: string;
}

interface TodoResult {
  readonly key: string;
  readonly todos?: Todo[];
  readonly error?: unknown;
}

function formatCreatedAt(value: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

/**
 * A single to-do list: add a title, tick an item off, and the completed state survives a refresh.
 *
 * The page renders one `Card` for the add form and one for the list. Loading, failure and empty are three separate
 * bodies of the list card, and the validation message sits under the field it belongs to.
 */
export default function TodosPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = String(reloadCount);
  // Each result carries the request that produced it; `result.key !== requestKey` means the current request is still
  // in flight, so "loading" is derived instead of tracked separately.
  const [result, setResult] = useState<TodoResult>();

  const [title, setTitle] = useState('');
  const [titleInvalid, setTitleInvalid] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pendingIds, setPendingIds] = useState<readonly number[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
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

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const todos = result?.todos;
  const total = todos?.length ?? 0;
  const done = todos?.filter((todo) => todo.completed).length ?? 0;

  function reload(): void {
    setReloadCount((count) => count + 1);
  }

  async function addTodo(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const value = title.trim();
    if (!value) {
      setTitleInvalid(true);
      return;
    }
    setAdding(true);
    try {
      const { data } = await api.request<{ data: Todo }, { title: string }>({
        path: 'todos',
        method: 'POST',
        json: { title: value },
      });
      setResult((current) => ({
        key: requestKey,
        todos: [data, ...(current?.todos ?? [])],
      }));
      setTitle('');
      setTitleInvalid(false);
      toast.add({ type: 'success', title: t('todos.addSuccess') });
    } catch {
      // Network failures and server errors both land here; `error.message` is not shown.
      toast.add({ type: 'error', title: t('todos.addFailed') });
    } finally {
      setAdding(false);
    }
  }

  async function toggleTodo(todo: Todo, completed: boolean): Promise<void> {
    setPendingIds((ids) => [...ids, todo.id]);
    try {
      const { data } = await api.request<
        { data: Todo },
        { completed: boolean }
      >({
        path: `todos/${todo.id}`,
        method: 'PATCH',
        json: { completed },
      });
      setResult((current) => ({
        key: requestKey,
        todos: (current?.todos ?? []).map((entry) =>
          entry.id === data.id ? data : entry,
        ),
      }));
    } catch {
      toast.add({ type: 'error', title: t('todos.toggleFailed') });
    } finally {
      setPendingIds((ids) => ids.filter((id) => id !== todo.id));
    }
  }

  let listBody: ReactElement;
  if (loading) {
    listBody = (
      <div className='space-y-3'>
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className='h-16 w-full rounded-xl' />
        ))}
      </div>
    );
  } else if (error) {
    listBody = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {error instanceof ApiClientError && error.status === 403
            ? t('todos.forbidden')
            : t('todos.loadFailed')}
        </AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              reload();
              // The retry button disappears with the error, so focus returns to the card.
              listRef.current?.focus();
            }}
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (total === 0) {
    listBody = (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <ListTodoIcon />
          </EmptyMedia>
          <EmptyTitle>{t('todos.emptyTitle')}</EmptyTitle>
          <EmptyDescription>{t('todos.emptyDescription')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    listBody = (
      <ItemGroup>
        {todos?.map((todo) => {
          const pending = pendingIds.includes(todo.id);
          return (
            <Item key={todo.id} variant='outline'>
              <ItemMedia>
                <Checkbox
                  checked={todo.completed}
                  disabled={pending}
                  aria-label={
                    todo.completed
                      ? t('todos.markIncomplete')
                      : t('todos.markComplete')
                  }
                  onCheckedChange={(checked) => {
                    void toggleTodo(todo, checked);
                  }}
                />
              </ItemMedia>
              <ItemContent>
                <ItemTitle
                  className={
                    todo.completed
                      ? 'text-muted-foreground line-through'
                      : undefined
                  }
                >
                  {todo.title}
                </ItemTitle>
                <ItemDescription>
                  {formatCreatedAt(todo.createdAt, locale)}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Badge variant={todo.completed ? 'secondary' : 'outline'}>
                  {todo.completed ? t('todos.completed') : t('todos.pending')}
                </Badge>
              </ItemActions>
            </Item>
          );
        })}
      </ItemGroup>
    );
  }

  return (
    <PageContainer>
      <div className='mx-auto w-full max-w-2xl space-y-6'>
        <PageHeader
          title={t('todos.title')}
          description={t('todos.description')}
        />
        <Card>
          <CardContent className='pt-6'>
            <form onSubmit={(event) => void addTodo(event)} noValidate>
              <Field data-invalid={titleInvalid ? true : undefined}>
                <FieldLabel htmlFor='todo-title'>
                  {t('todos.addLabel')}
                </FieldLabel>
                <div className='flex flex-col gap-2 sm:flex-row'>
                  <Input
                    id='todo-title'
                    name='title'
                    value={title}
                    placeholder={t('todos.addPlaceholder')}
                    autoComplete='off'
                    aria-invalid={titleInvalid || undefined}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      if (titleInvalid) setTitleInvalid(false);
                    }}
                  />
                  <Button type='submit' disabled={adding}>
                    {adding ? (
                      <Spinner data-icon='inline-start' />
                    ) : (
                      <PlusIcon data-icon='inline-start' />
                    )}
                    {adding ? t('todos.adding') : t('todos.add')}
                  </Button>
                </div>
                <FieldError>
                  {titleInvalid ? t('todos.titleRequired') : null}
                </FieldError>
              </Field>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('todos.listTitle')}</CardTitle>
            <CardDescription>
              {t('todos.summary', { done, total })}
            </CardDescription>
          </CardHeader>
          <CardContent tabIndex={-1} ref={listRef} className='outline-none'>
            {listBody}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

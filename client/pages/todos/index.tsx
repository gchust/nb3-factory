import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  CalendarClockIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { Checkbox } from '#components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Field, FieldLabel } from '#components/ui/field';
import { Input } from '#components/ui/input';
import { Skeleton } from '#components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import {
  createTodo,
  deleteTodo,
  fetchTodos,
  updateTodo,
  type Todo,
  type TodoList,
} from './api.js';

const PAGE_SIZE = 20;

/** `<input type="datetime-local">` reads and writes local wall-clock time, not an ISO instant. */
function toDateTimeLocal(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string): string {
  return new Date(value).toISOString();
}

type TodoStatus = 'completed' | 'pending' | 'overdue' | 'expired';

function statusOf(todo: Todo): TodoStatus {
  if (todo.completed) return 'completed';
  if (todo.expired) return 'expired';
  if (new Date(todo.dueAt).getTime() < Date.now()) return 'overdue';
  return 'pending';
}

export default function TodosPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    readonly page: number;
    readonly revision: number;
    readonly data?: TodoList;
    readonly error?: unknown;
    readonly loading: boolean;
  }>({ page: 1, revision: -1, loading: true });
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState(() =>
    toDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1_000)),
  );
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<unknown>();
  const [busyId, setBusyId] = useState<string>();
  const [editing, setEditing] = useState<Todo>();
  const [editTitle, setEditTitle] = useState('');
  const [editDueAt, setEditDueAt] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<unknown>();
  const [deleting, setDeleting] = useState<Todo>();
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>();

  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const replaceTodo = useCallback((updated: Todo) => {
    setState((old) =>
      old.data
        ? {
            ...old,
            data: {
              ...old.data,
              data: old.data.data.map((todo) =>
                todo.id === updated.id ? updated : todo,
              ),
            },
          }
        : old,
    );
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchTodos(api, page, PAGE_SIZE, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          setState({ page, revision, data, loading: false });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState((old) => ({
            ...old,
            page,
            revision,
            error,
            loading: false,
          }));
        }
      },
    );
    return () => controller.abort();
  }, [api, page, revision]);

  const data = state.page === page ? state.data : undefined;
  const loading =
    state.loading || state.page !== page || state.revision !== revision;
  const error =
    state.page === page && state.revision === revision
      ? state.error
      : undefined;
  const todos = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !dueAt) return;
    setCreating(true);
    setCreateError(undefined);
    try {
      await createTodo(api, {
        title: title.trim(),
        dueAt: toIso(dueAt),
      });
      setTitle('');
      setDueAt(toDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1_000)));
      if (page !== 1) setPage(1);
      refresh();
    } catch (next) {
      setCreateError(next);
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (todo: Todo, completed: boolean) => {
    setBusyId(todo.id);
    setCreateError(undefined);
    try {
      replaceTodo(
        await updateTodo(api, todo.id, {
          completed,
        }),
      );
    } catch (next) {
      setCreateError(next);
    } finally {
      setBusyId(undefined);
    }
  };

  const openEdit = (todo: Todo) => {
    setEditing(todo);
    setEditTitle(todo.title);
    setEditDueAt(toDateTimeLocal(new Date(todo.dueAt)));
    setEditError(undefined);
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || !editTitle.trim() || !editDueAt) return;
    const titleChanged = editTitle.trim() !== editing.title;
    // Send `dueAt` only when it moved: the service clears `expired` for a new due time, and editing the title must not
    // reopen an expired todo.
    const dueAtChanged = editDueAt !== toDateTimeLocal(new Date(editing.dueAt));
    if (!titleChanged && !dueAtChanged) {
      setEditing(undefined);
      return;
    }
    setEditBusy(true);
    setEditError(undefined);
    try {
      replaceTodo(
        await updateTodo(api, editing.id, {
          ...(titleChanged ? { title: editTitle.trim() } : {}),
          ...(dueAtChanged ? { dueAt: toIso(editDueAt) } : {}),
        }),
      );
      setEditing(undefined);
    } catch (next) {
      setEditError(next);
    } finally {
      setEditBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(undefined);
    try {
      await deleteTodo(api, deleting.id);
      setDeleting(undefined);
      if (todos.length === 1 && page > 1) setPage(page - 1);
      else refresh();
    } catch (next) {
      setDeleteError(next);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <PageContainer className='mx-auto max-w-5xl'>
      <PageHeader
        title={t('todos.title')}
        description={t('todos.description')}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('todos.createTitle')}</CardTitle>
          <CardDescription>{t('todos.createDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className='flex flex-col gap-4 sm:flex-row sm:items-end'
            onSubmit={(event) => void submit(event)}
          >
            <Field className='flex-1'>
              <FieldLabel htmlFor='todo-title'>
                {t('todos.titleLabel')}
              </FieldLabel>
              <Input
                id='todo-title'
                value={title}
                maxLength={191}
                placeholder={t('todos.titlePlaceholder')}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field className='sm:w-64'>
              <FieldLabel htmlFor='todo-due'>{t('todos.dueLabel')}</FieldLabel>
              <Input
                id='todo-due'
                type='datetime-local'
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </Field>
            <Button
              type='submit'
              disabled={creating || !title.trim() || !dueAt}
            >
              <PlusIcon data-icon='inline-start' />
              {creating ? t('todos.adding') : t('todos.add')}
            </Button>
          </form>
          {createError ? (
            <Alert variant='destructive' className='mt-4'>
              <AlertDescription>{t('todos.saveFailed')}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <section className='flex flex-col gap-3'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-base font-medium'>{t('todos.listTitle')}</h2>
            <p className='text-sm text-muted-foreground'>
              {t('todos.listDescription')}
            </p>
          </div>
          <p className='text-sm text-muted-foreground'>
            {t('todos.total', { total })}
          </p>
        </div>

        {error ? (
          <Alert variant='destructive'>
            <AlertDescription className='flex flex-wrap items-center justify-between gap-2'>
              {t('todos.loadFailed')}
              <Button variant='outline' size='sm' onClick={refresh}>
                {t('todos.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className='overflow-hidden rounded-lg border'>
          <Table aria-busy={loading}>
            <TableHeader>
              <TableRow>
                <TableHead className='w-10'>
                  <span className='sr-only'>{t('todos.done')}</span>
                </TableHead>
                <TableHead>{t('todos.titleLabel')}</TableHead>
                <TableHead>{t('todos.dueLabel')}</TableHead>
                <TableHead>{t('todos.status')}</TableHead>
                <TableHead className='text-right'>
                  {t('todos.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && todos.length === 0 ? (
                [0, 1, 2].map((row) => (
                  <TableRow key={row}>
                    <TableCell colSpan={5}>
                      <Skeleton className='h-8 w-full' />
                    </TableCell>
                  </TableRow>
                ))
              ) : todos.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className='h-24 text-center text-muted-foreground'
                  >
                    {t('todos.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                todos.map((todo) => {
                  const status = statusOf(todo);
                  return (
                    <TableRow key={todo.id}>
                      <TableCell>
                        <Checkbox
                          checked={todo.completed}
                          disabled={busyId === todo.id}
                          aria-label={
                            todo.completed
                              ? t('todos.markIncomplete', { title: todo.title })
                              : t('todos.markComplete', { title: todo.title })
                          }
                          onCheckedChange={(checked) =>
                            void toggle(todo, checked === true)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            todo.completed
                              ? 'text-muted-foreground line-through'
                              : 'font-medium'
                          }
                        >
                          {todo.title}
                        </span>
                      </TableCell>
                      <TableCell className='text-muted-foreground'>
                        <span className='inline-flex items-center gap-1.5'>
                          <CalendarClockIcon className='size-3.5' aria-hidden />
                          <time dateTime={todo.dueAt}>
                            {new Date(todo.dueAt).toLocaleString()}
                          </time>
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            status === 'pending'
                              ? 'secondary'
                              : status === 'completed'
                                ? 'outline'
                                : 'destructive'
                          }
                        >
                          {t(`todos.statuses.${status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className='flex justify-end gap-1'>
                          <Button
                            size='icon-sm'
                            variant='ghost'
                            aria-label={t('todos.editNamed', {
                              title: todo.title,
                            })}
                            onClick={() => openEdit(todo)}
                          >
                            <PencilIcon />
                          </Button>
                          <Button
                            size='icon-sm'
                            variant='ghost'
                            aria-label={t('todos.deleteNamed', {
                              title: todo.title,
                            })}
                            onClick={() => {
                              setDeleting(todo);
                              setDeleteError(undefined);
                            }}
                          >
                            <Trash2Icon />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className='flex items-center justify-between gap-2'>
          <p className='text-sm text-muted-foreground'>
            {t('todos.pageOf', { page, pages: pageCount })}
          </p>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={page <= 1 || loading}
              onClick={() => setPage(Math.max(1, page - 1))}
            >
              <ChevronLeftIcon data-icon='inline-start' />
              {t('todos.previous')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={page >= pageCount || loading}
              onClick={() => setPage(Math.min(pageCount, page + 1))}
            >
              {t('todos.next')}
              <ChevronRightIcon data-icon='inline-end' />
            </Button>
          </div>
        </div>
      </section>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open && !editBusy) setEditing(undefined);
        }}
      >
        <DialogContent>
          <form
            className='flex flex-col gap-5'
            onSubmit={(event) => void saveEdit(event)}
          >
            <DialogHeader>
              <DialogTitle>{t('todos.editTitle')}</DialogTitle>
              <DialogDescription>
                {t('todos.editDescription')}
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor='todo-edit-title'>
                {t('todos.titleLabel')}
              </FieldLabel>
              <Input
                id='todo-edit-title'
                value={editTitle}
                maxLength={191}
                onChange={(event) => setEditTitle(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='todo-edit-due'>
                {t('todos.dueLabel')}
              </FieldLabel>
              <Input
                id='todo-edit-due'
                type='datetime-local'
                value={editDueAt}
                onChange={(event) => setEditDueAt(event.target.value)}
              />
            </Field>
            {editError ? (
              <Alert variant='destructive'>
                <AlertDescription>{t('todos.saveFailed')}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                disabled={editBusy}
                onClick={() => setEditing(undefined)}
              >
                {t('todos.cancel')}
              </Button>
              <Button
                type='submit'
                disabled={editBusy || !editTitle.trim() || !editDueAt}
              >
                <CheckIcon data-icon='inline-start' />
                {editBusy ? t('todos.saving') : t('todos.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleting(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('todos.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('todos.deleteDescription', { title: deleting?.title ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <Alert variant='destructive'>
              <AlertDescription>{t('todos.deleteFailed')}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>
              {t('todos.cancel')}
            </AlertDialogCancel>
            <Button
              variant='destructive'
              disabled={deleteBusy}
              onClick={() => void remove()}
            >
              <Trash2Icon data-icon='inline-start' />
              {deleteBusy ? t('todos.saving') : t('todos.delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

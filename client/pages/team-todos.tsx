import {
  apiClientToken,
  ApiClientError,
  useService,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';

import { Loading } from '@/components/loading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import {
  createTeamTodo,
  deleteTeamTodo,
  listTeamTodos,
  updateTeamTodo,
  type ListTeamTodosOptions,
  type TeamTodo,
  type TeamTodoStats,
  type TodoPriority,
  type TodoStatus,
} from '../lib/team-todos';

const STATUSES: readonly TodoStatus[] = ['pending', 'inProgress', 'completed'];
const PRIORITIES: readonly TodoPriority[] = ['normal', 'urgent'];

interface TodoFormState {
  title: string;
  description: string;
  status: TodoStatus;
  priority: TodoPriority;
  dueDate: string;
}

const EMPTY_FORM: TodoFormState = {
  title: '',
  description: '',
  status: 'pending',
  priority: 'normal',
  dueDate: '',
};

function formFromTodo(todo: TeamTodo): TodoFormState {
  return {
    title: todo.title,
    description: todo.description ?? '',
    status: todo.status,
    priority: todo.priority,
    dueDate: todo.dueDate ?? '',
  };
}

export default function TeamTodosPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);

  const [todos, setTodos] = useState<TeamTodo[]>([]);
  const [stats, setStats] = useState<TeamTodoStats>({
    all: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TodoStatus | 'all'>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TeamTodo | undefined>();
  const [form, setForm] = useState<TodoFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<TeamTodo | undefined>();
  const [deleteError, setDeleteError] = useState<string>();
  const [deleteBusy, setDeleteBusy] = useState(false);

  const query = useMemo<ListTeamTodosOptions>(
    () => ({
      search: search.trim() || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
    }),
    [search, statusFilter],
  );

  const load = useCallback(async (): Promise<void> => {
    try {
      const result = await listTeamTodos(api, query);
      setTodos(result.data);
      setStats(result.stats);
      setLoadError(undefined);
    } catch {
      setLoadError(t('teamTodos.loadFailed'));
    }
  }, [api, query, t]);

  useEffect(() => {
    let active = true;
    void listTeamTodos(api, query)
      .then((result) => {
        if (active) {
          setTodos(result.data);
          setStats(result.stats);
          setLoadError(undefined);
        }
      })
      .catch(() => {
        if (active) {
          setLoadError(t('teamTodos.loadFailed'));
        }
      })
      .then(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [api, query, t]);

  const openCreate = useCallback((): void => {
    setEditing(undefined);
    setForm(EMPTY_FORM);
    setFormError(undefined);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((todo: TeamTodo): void => {
    setEditing(todo);
    setForm(formFromTodo(todo));
    setFormError(undefined);
    setDialogOpen(true);
  }, []);

  const closeDialog = useCallback((): void => {
    setDialogOpen(false);
    setFormError(undefined);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent): Promise<void> => {
      event.preventDefault();
      const title = form.title.trim();
      if (!title) {
        setFormError(t('teamTodos.titleRequired'));
        return;
      }
      if (title.length > 100) {
        setFormError(t('teamTodos.titleMaxLength'));
        return;
      }
      if (form.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate)) {
        setFormError(t('teamTodos.errors.INVALID_DUE_DATE'));
        return;
      }

      setSaving(true);
      setFormError(undefined);
      try {
        const input = {
          title,
          description: form.description,
          status: form.status,
          priority: form.priority,
          dueDate: form.dueDate || null,
        };
        if (editing) {
          await updateTeamTodo(api, editing.id, input);
        } else {
          await createTeamTodo(api, input);
        }
        setDialogOpen(false);
        await load();
      } catch (error) {
        setFormError(translateError(error, t));
      } finally {
        setSaving(false);
      }
    },
    [api, editing, form, load, t],
  );

  const changeStatus = useCallback(
    async (todo: TeamTodo, status: TodoStatus): Promise<void> => {
      try {
        await updateTeamTodo(api, todo.id, { status });
        await load();
      } catch (error) {
        setLoadError(translateError(error, t));
      }
    },
    [api, load, t],
  );

  const requestDelete = useCallback((todo: TeamTodo): void => {
    setDeleting(todo);
    setDeleteError(undefined);
  }, []);

  const cancelDelete = useCallback((): void => {
    setDeleting(undefined);
    setDeleteError(undefined);
  }, []);

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (!deleting) {
      return;
    }
    setDeleteBusy(true);
    setDeleteError(undefined);
    try {
      await deleteTeamTodo(api, deleting.id);
      setDeleting(undefined);
      await load();
    } catch (error) {
      setDeleteError(translateError(error, t));
    } finally {
      setDeleteBusy(false);
    }
  }, [api, deleting, load, t]);

  const clearFilters = useCallback((): void => {
    setSearch('');
    setStatusFilter('all');
  }, []);

  const filtersActive = search.trim() !== '' || statusFilter !== 'all';

  // Base UI's SelectValue renders the raw value unless the root is given an
  // `itemToStringLabel` mapper, so translate the selected value here.
  const statusFilterLabel = useCallback(
    (value: string): string =>
      value === 'all'
        ? t('teamTodos.allStatuses')
        : t(`teamTodos.status.${value}`),
    [t],
  );
  const statusLabel = useCallback(
    (value: string): string => t(`teamTodos.status.${value}`),
    [t],
  );
  const priorityLabel = useCallback(
    (value: string): string => t(`teamTodos.priority.${value}`),
    [t],
  );

  return (
    <section className='mx-auto w-full max-w-5xl space-y-6 px-6 py-8'>
      <div className='flex items-center justify-between gap-4'>
        <h1 className='text-2xl font-semibold tracking-tight'>
          {t('teamTodos.title')}
        </h1>
        <Button onClick={openCreate}>{t('teamTodos.newTodo')}</Button>
      </div>

      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        <StatCard label={t('teamTodos.stats.all')} value={stats.all} />
        <StatCard label={t('teamTodos.stats.pending')} value={stats.pending} />
        <StatCard
          label={t('teamTodos.stats.inProgress')}
          value={stats.inProgress}
        />
        <StatCard
          label={t('teamTodos.stats.completed')}
          value={stats.completed}
        />
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <Input
          aria-label={t('teamTodos.searchPlaceholder')}
          className='w-64'
          placeholder={t('teamTodos.searchPlaceholder')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          value={statusFilter}
          onValueChange={(value) =>
            setStatusFilter(value as TodoStatus | 'all')
          }
          itemToStringLabel={statusFilterLabel}
        >
          <SelectTrigger aria-label={t('teamTodos.statusFilter')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all' label={t('teamTodos.allStatuses')}>
              {t('teamTodos.allStatuses')}
            </SelectItem>
            {STATUSES.map((status) => (
              <SelectItem
                key={status}
                value={status}
                label={t(`teamTodos.status.${status}`)}
              >
                {t(`teamTodos.status.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtersActive && (
          <Button variant='outline' onClick={clearFilters}>
            {t('teamTodos.clearFilters')}
          </Button>
        )}
      </div>

      {loadError && (
        <p className='text-sm text-destructive' role='alert'>
          {loadError}
        </p>
      )}

      {loading ? (
        <Loading label={t('teamTodos.title')} />
      ) : todos.length === 0 ? (
        <div className='rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground'>
          {filtersActive ? t('teamTodos.empty') : t('teamTodos.emptyAll')}
        </div>
      ) : (
        <ul className='space-y-3'>
          {todos.map((todo) => (
            <li key={todo.id}>
              <Card>
                <CardContent className='flex flex-col gap-3'>
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div className='min-w-0 space-y-1'>
                      <h3 className='font-medium break-words'>{todo.title}</h3>
                      {todo.description && (
                        <p className='text-sm text-muted-foreground break-words'>
                          {todo.description}
                        </p>
                      )}
                    </div>
                    <Select
                      value={todo.status}
                      onValueChange={(value) =>
                        void changeStatus(todo, value as TodoStatus)
                      }
                      itemToStringLabel={statusLabel}
                    >
                      <SelectTrigger
                        aria-label={t('teamTodos.field.status')}
                        size='sm'
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((status) => (
                          <SelectItem
                            key={status}
                            value={status}
                            label={t(`teamTodos.status.${status}`)}
                          >
                            {t(`teamTodos.status.${status}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Badge
                      variant={
                        todo.priority === 'urgent' ? 'destructive' : 'secondary'
                      }
                    >
                      {t(`teamTodos.priority.${todo.priority}`)}
                    </Badge>
                    {todo.dueDate && (
                      <span className='text-xs text-muted-foreground'>
                        {todo.dueDate}
                      </span>
                    )}
                    <div className='ml-auto flex items-center gap-2'>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => openEdit(todo)}
                      >
                        {t('teamTodos.edit')}
                      </Button>
                      <Button
                        size='sm'
                        variant='destructive'
                        onClick={() => requestDelete(todo)}
                      >
                        {t('teamTodos.delete')}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? t('teamTodos.editTodo') : t('teamTodos.newTodo')}
            </DialogTitle>
          </DialogHeader>
          <form
            className='space-y-4'
            onSubmit={(event) => void handleSubmit(event)}
          >
            <div className='space-y-1.5'>
              <Label htmlFor='todo-title'>{t('teamTodos.field.title')} *</Label>
              <Input
                id='todo-title'
                maxLength={100}
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='todo-description'>
                {t('teamTodos.field.description')}
              </Label>
              <Textarea
                id='todo-description'
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1.5'>
                <Label>{t('teamTodos.field.status')}</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      status: value as TodoStatus,
                    }))
                  }
                  itemToStringLabel={statusLabel}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((status) => (
                      <SelectItem
                        key={status}
                        value={status}
                        label={t(`teamTodos.status.${status}`)}
                      >
                        {t(`teamTodos.status.${status}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1.5'>
                <Label>{t('teamTodos.field.priority')}</Label>
                <Select
                  value={form.priority}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      priority: value as TodoPriority,
                    }))
                  }
                  itemToStringLabel={priorityLabel}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((priority) => (
                      <SelectItem
                        key={priority}
                        value={priority}
                        label={t(`teamTodos.priority.${priority}`)}
                      >
                        {t(`teamTodos.priority.${priority}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='todo-due-date'>
                {t('teamTodos.field.dueDate')}
              </Label>
              <Input
                id='todo-due-date'
                type='text'
                inputMode='numeric'
                autoComplete='off'
                maxLength={10}
                placeholder={t('teamTodos.field.dueDatePlaceholder')}
                value={form.dueDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
              />
            </div>
            {formError && (
              <p className='text-sm text-destructive' role='alert'>
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={closeDialog}
                disabled={saving}
              >
                {t('actions.cancel')}
              </Button>
              <Button type='submit' disabled={saving}>
                {saving ? t('actions.saving') : t('actions.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            cancelDelete();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('teamTodos.deleteTodo')}</DialogTitle>
          </DialogHeader>
          <p className='text-sm text-muted-foreground'>
            {deleting
              ? t('teamTodos.deleteConfirm', { title: deleting.title })
              : ''}
          </p>
          {deleteError && (
            <p className='text-sm text-destructive' role='alert'>
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant='outline'
              onClick={cancelDelete}
              disabled={deleteBusy}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              variant='destructive'
              onClick={() => void confirmDelete()}
              disabled={deleteBusy}
            >
              {deleteBusy ? t('actions.saving') : t('teamTodos.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}): ReactElement {
  return (
    <Card>
      <CardContent className='flex flex-col gap-1'>
        <span className='text-sm text-muted-foreground'>{label}</span>
        <span className='text-2xl font-semibold tabular-nums'>{value}</span>
      </CardContent>
    </Card>
  );
}

function translateError(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (error instanceof ApiClientError && error.code) {
    const key = `teamTodos.errors.${error.code}`;
    const translated = t(key);
    if (translated !== key) {
      return translated;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return t('teamTodos.errors.UNKNOWN');
}

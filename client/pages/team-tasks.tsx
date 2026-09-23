import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Check, ClipboardList, LoaderCircle, Pencil, Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { toast } from 'sonner';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { cn } from '@/lib/utils';

type TeamTaskStatus = 'pending' | 'done';
type StatusFilter = 'all' | TeamTaskStatus;

interface TeamTask {
  readonly id: number;
  readonly title: string;
  readonly notes: string | null;
  readonly status: TeamTaskStatus;
}

interface TaskListResponse {
  readonly data: TeamTask[];
  readonly canManage: boolean;
}

interface TaskResponse {
  readonly data: TeamTask;
}

export default function TeamTasksPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();

  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeamTask | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<TeamTaskStatus>('pending');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void api
      .request<TaskListResponse>({
        path: 'team-tasks',
        query: filter === 'all' ? undefined : { status: filter },
        signal: controller.signal,
      })
      .then((response) => {
        setTasks(response.data);
        setCanManage(response.canManage);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailed(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [api, filter, reloadToken]);

  function refresh(): void {
    setLoading(true);
    setReloadToken((value) => value + 1);
  }

  function openCreate(): void {
    setEditing(null);
    setTitle('');
    setNotes('');
    setStatus('pending');
    setTitleError(null);
    setFormOpen(true);
  }

  function openEdit(task: TeamTask): void {
    setEditing(task);
    setTitle(task.title);
    setNotes(task.notes ?? '');
    setStatus(task.status);
    setTitleError(null);
    setFormOpen(true);
  }

  function closeForm(): void {
    setFormOpen(false);
    setEditing(null);
    setTitle('');
    setNotes('');
    setStatus('pending');
    setTitleError(null);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      setTitleError(t('teamTasks.titleRequired'));
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await api.request<TaskResponse>({
          path: `team-tasks/${editing.id}`,
          method: 'PATCH',
          json: { title: trimmedTitle, notes, status },
        });
        toast.success(t('teamTasks.updated'));
      } else {
        await api.request<TaskResponse>({
          path: 'team-tasks',
          method: 'POST',
          json: { title: trimmedTitle, notes },
        });
        toast.success(t('teamTasks.created'));
      }
      closeForm();
      refresh();
    } catch {
      toast.error(t('teamTasks.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete(task: TeamTask): Promise<void> {
    setBusyId(task.id);
    try {
      await api.request<TaskResponse>({
        path: `team-tasks/${task.id}`,
        method: 'PATCH',
        json: { status: 'done' },
      });
      toast.success(t('teamTasks.completed'));
      refresh();
    } catch {
      toast.error(t('teamTasks.saveFailed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageContainer className='mx-auto max-w-4xl'>
      <Breadcrumbs />
      <PageHeader
        title={t('teamTasks.title')}
        description={t('teamTasks.description')}
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus className='size-4' />
              {t('teamTasks.newTask')}
            </Button>
          ) : null
        }
      />

      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Select
          value={filter}
          onValueChange={(value: unknown) => {
            if (value === 'all' || value === 'pending' || value === 'done') {
              if (value !== filter) {
                setLoading(true);
              }
              setFilter(value);
            }
          }}
        >
          <SelectTrigger
            aria-label={t('teamTasks.filterLabel')}
            className='w-40'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>{t('teamTasks.filterAll')}</SelectItem>
            <SelectItem value='pending'>
              {t('teamTasks.statusPending')}
            </SelectItem>
            <SelectItem value='done'>{t('teamTasks.statusDone')}</SelectItem>
          </SelectContent>
        </Select>
        {!canManage && !loading ? (
          <p className='text-sm text-muted-foreground'>
            {t('teamTasks.readOnly')}
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className='flex items-center justify-center rounded-xl border border-border py-16 text-muted-foreground'>
          <LoaderCircle
            aria-label={t('teamTasks.loading')}
            className='size-5 animate-spin'
          />
        </div>
      ) : failed ? (
        <div className='flex flex-col items-center gap-3 rounded-xl border border-border py-16 text-center'>
          <p className='text-sm text-muted-foreground'>
            {t('teamTasks.loadFailed')}
          </p>
          <Button onClick={refresh} variant='outline'>
            {t('status.retry')}
          </Button>
        </div>
      ) : tasks.length === 0 ? (
        <div className='flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center'>
          <ClipboardList className='size-8 text-muted-foreground' />
          <div className='space-y-1'>
            <p className='font-medium'>{t('teamTasks.emptyTitle')}</p>
            <p className='text-sm text-muted-foreground'>
              {t('teamTasks.emptyDescription')}
            </p>
          </div>
        </div>
      ) : (
        <ul className='space-y-3'>
          {tasks.map((task) => (
            <li
              key={task.id}
              className='flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between'
            >
              <div className='min-w-0 space-y-1.5'>
                <div className='flex flex-wrap items-center gap-2'>
                  <p
                    className={cn(
                      'font-medium break-words',
                      task.status === 'done' &&
                        'text-muted-foreground line-through',
                    )}
                  >
                    {task.title}
                  </p>
                  <StatusBadge status={task.status} />
                </div>
                {task.notes ? (
                  <p className='text-sm break-words whitespace-pre-wrap text-muted-foreground'>
                    {task.notes}
                  </p>
                ) : null}
              </div>
              {canManage ? (
                <div className='flex shrink-0 items-center gap-2'>
                  {task.status === 'pending' ? (
                    <Button
                      disabled={busyId === task.id}
                      onClick={() => void handleComplete(task)}
                      size='sm'
                      variant='outline'
                    >
                      <Check className='size-3.5' />
                      {t('teamTasks.markComplete')}
                    </Button>
                  ) : null}
                  <Button
                    disabled={busyId === task.id}
                    onClick={() => openEdit(task)}
                    size='sm'
                    variant='ghost'
                  >
                    <Pencil className='size-3.5' />
                    {t('teamTasks.edit')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={(open: boolean) => {
          if (!open) {
            closeForm();
          }
        }}
      >
        <DialogContent>
          <form
            className='space-y-4'
            onSubmit={(event) => void handleSubmit(event)}
          >
            <DialogHeader>
              <DialogTitle>
                {editing
                  ? t('teamTasks.editTitle')
                  : t('teamTasks.createTitle')}
              </DialogTitle>
              <DialogDescription>
                {t('teamTasks.formDescription')}
              </DialogDescription>
            </DialogHeader>

            <div className='space-y-2'>
              <Label htmlFor='team-task-title'>
                {t('teamTasks.titleLabel')}
              </Label>
              <Input
                aria-invalid={titleError ? true : undefined}
                id='team-task-title'
                autoFocus
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  if (titleError) {
                    setTitleError(null);
                  }
                }}
                placeholder={t('teamTasks.titlePlaceholder')}
              />
              {titleError ? (
                <p className='text-sm text-destructive'>{titleError}</p>
              ) : null}
            </div>

            <div className='space-y-2'>
              <Label htmlFor='team-task-notes'>
                {t('teamTasks.notesLabel')}
              </Label>
              <textarea
                id='team-task-notes'
                className='min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={t('teamTasks.notesPlaceholder')}
              />
            </div>

            {editing ? (
              <div className='space-y-2'>
                <Label>{t('teamTasks.statusLabel')}</Label>
                <Select
                  value={status}
                  onValueChange={(value: unknown) => {
                    if (value === 'pending' || value === 'done') {
                      setStatus(value);
                    }
                  }}
                >
                  <SelectTrigger
                    aria-label={t('teamTasks.statusLabel')}
                    className='w-full'
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='pending'>
                      {t('teamTasks.statusPending')}
                    </SelectItem>
                    <SelectItem value='done'>
                      {t('teamTasks.statusDone')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <DialogFooter>
              <Button
                disabled={saving}
                onClick={closeForm}
                type='button'
                variant='outline'
              >
                {t('actions.cancel')}
              </Button>
              <Button disabled={saving} type='submit'>
                {saving ? t('teamTasks.saving') : t('actions.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function StatusBadge({
  status,
}: {
  readonly status: TeamTaskStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'done'
          ? 'bg-muted text-muted-foreground'
          : 'bg-primary/10 text-primary',
      )}
    >
      {status === 'done'
        ? t('teamTasks.statusDone')
        : t('teamTasks.statusPending')}
    </span>
  );
}

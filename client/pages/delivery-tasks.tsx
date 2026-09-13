import { useTranslation } from '@nocobase/i18n/client';
import { Plus, RefreshCw } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  FormInput,
  FormSelect,
  FormTextarea,
  StatusBadge,
  DeliveryEmpty,
  DeliveryError,
  DeliveryHeader,
  DeliveryLoading,
} from '@/components/delivery/ui';
import { formatDate } from '@/components/delivery/format';
import { useAsyncData } from '@/components/delivery/use-async-data';
import {
  useDeliveryApi,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '@/components/delivery/delivery-api';

const EMPTY_FORM = {
  projectId: '',
  milestoneId: '',
  assigneeId: '',
  name: '',
  priority: 'medium' as TaskPriority,
  status: 'todo' as TaskStatus,
  plannedDate: '',
  actualDate: '',
  description: '',
};

export default function DeliveryTasksPage(): ReactElement {
  const { t } = useTranslation();
  const api = useDeliveryApi();
  const actor = useAsyncData(() => api.me(), [api]);
  const projects = useAsyncData(() => api.listProjects(), [api]);
  const members = useAsyncData(() => api.members(), [api]);
  const milestones = useAsyncData(() => api.listMilestones(), [api]);
  const [projectFilter, setProjectFilter] = useState('');
  const tasks = useAsyncData(
    () =>
      api.listTasks(projectFilter ? { projectId: Number(projectFilter) } : {}),
    [api, projectFilter],
  );
  const canManage = actor.data ? actor.data.role !== 'member' : false;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const projectOptions = (projects.data ?? []).map((project) => ({
    value: String(project.id),
    label: project.name,
  }));
  const memberOptions = (members.data ?? []).map((member) => ({
    value: member.id,
    label: member.name || member.id,
  }));
  const statusOptions = [
    { value: 'todo', label: t('delivery.status.task.todo') },
    { value: 'in_progress', label: t('delivery.status.task.in_progress') },
    { value: 'completed', label: t('delivery.status.task.completed') },
  ];
  const priorityOptions = [
    { value: 'low', label: t('delivery.priority.low') },
    { value: 'medium', label: t('delivery.priority.medium') },
    { value: 'high', label: t('delivery.priority.high') },
  ];

  return (
    <section className='space-y-6 p-6'>
      <DeliveryHeader
        title={t('delivery.tasks.title')}
        description={t('delivery.tasks.description')}
        actions={
          <>
            <Button variant='outline' size='sm' onClick={tasks.reload}>
              <RefreshCw aria-hidden='true' />
              {t('delivery.actions.refresh')}
            </Button>
            {canManage ? (
              <Button
                size='sm'
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus aria-hidden='true' />
                {t('delivery.tasks.create')}
              </Button>
            ) : null}
          </>
        }
      />
      <div className='max-w-xs'>
        <FormSelect
          id='task-project-filter'
          label={t('delivery.fields.project')}
          value={projectFilter}
          onChange={setProjectFilter}
          emptyLabel={t('delivery.allProjects')}
          options={projectOptions}
        />
      </div>
      {tasks.loading ? <DeliveryLoading /> : null}
      {tasks.error ? (
        <DeliveryError error={tasks.error} onRetry={tasks.reload} />
      ) : null}
      {tasks.data ? (
        <Card>
          <CardContent>
            {tasks.data.length === 0 ? (
              <DeliveryEmpty>{t('delivery.tasks.empty')}</DeliveryEmpty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('delivery.fields.name')}</TableHead>
                    <TableHead>{t('delivery.fields.project')}</TableHead>
                    <TableHead>{t('delivery.fields.milestone')}</TableHead>
                    <TableHead>{t('delivery.fields.assignee')}</TableHead>
                    <TableHead>{t('delivery.fields.priority')}</TableHead>
                    <TableHead>{t('delivery.fields.status')}</TableHead>
                    <TableHead>{t('delivery.fields.plannedDate')}</TableHead>
                    <TableHead>{t('delivery.fields.actualDate')}</TableHead>
                    <TableHead>{t('delivery.tasks.timeliness')}</TableHead>
                    <TableHead>{t('delivery.fields.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.data.map((task) => {
                    const isOwn = actor.data?.userId === task.assigneeId;
                    return (
                      <TableRow key={task.id}>
                        <TableCell className='font-medium'>
                          {task.name}
                        </TableCell>
                        <TableCell>{task.projectName ?? '—'}</TableCell>
                        <TableCell>{task.milestoneName ?? '—'}</TableCell>
                        <TableCell>{task.assigneeName ?? '—'}</TableCell>
                        <TableCell>
                          <StatusBadge
                            value={t(`delivery.priority.${task.priority}`)}
                            tone={
                              task.priority === 'high' ? 'warning' : 'neutral'
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            value={t(`delivery.status.task.${task.status}`)}
                            tone={taskStatusTone(task.status)}
                          />
                        </TableCell>
                        <TableCell>{formatDate(task.plannedDate)}</TableCell>
                        <TableCell>{formatDate(task.actualDate)}</TableCell>
                        <TableCell>
                          {task.timeliness ? (
                            <StatusBadge
                              value={t(
                                `delivery.timeliness.${task.timeliness}`,
                              )}
                              tone={
                                task.timeliness === 'overdue'
                                  ? 'warning'
                                  : 'positive'
                              }
                            />
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          {canManage ? (
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() => {
                                setEditing(task);
                                setFormOpen(true);
                              }}
                            >
                              {t('delivery.actions.edit')}
                            </Button>
                          ) : isOwn ? (
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() => {
                                setEditing(task);
                                setFormOpen(true);
                              }}
                            >
                              {t('delivery.tasks.updateStatus')}
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
      {actor.data && (canManage || editing) ? (
        <TaskFormDialog
          key={`${editing?.id ?? 'create'}-${canManage ? 'full' : 'status'}`}
          open={formOpen}
          task={editing}
          mode={canManage ? 'full' : 'status'}
          projectOptions={projectOptions}
          memberOptions={memberOptions}
          milestones={milestones.data ?? []}
          statusOptions={statusOptions}
          priorityOptions={priorityOptions}
          onOpenChange={setFormOpen}
          onSaved={() => {
            setFormOpen(false);
            tasks.reload();
          }}
        />
      ) : null}
    </section>
  );
}

function taskStatusTone(status: TaskStatus): string {
  switch (status) {
    case 'completed':
      return 'positive';
    case 'in_progress':
      return 'info';
    default:
      return 'neutral';
  }
}

function TaskFormDialog({
  open,
  task,
  mode,
  projectOptions,
  memberOptions,
  milestones,
  statusOptions,
  priorityOptions,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  task: Task | null;
  mode: 'full' | 'status';
  projectOptions: readonly { value: string; label: string }[];
  memberOptions: readonly { value: string; label: string }[];
  milestones: readonly { id: number; name: string; projectId: number }[];
  statusOptions: readonly { value: string; label: string }[];
  priorityOptions: readonly { value: string; label: string }[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useDeliveryApi();
  const [form, setForm] = useState(() =>
    task
      ? {
          projectId: String(task.projectId),
          milestoneId:
            task.milestoneId === null ? '' : String(task.milestoneId),
          assigneeId: task.assigneeId ?? '',
          name: task.name,
          priority: task.priority,
          status: task.status,
          plannedDate: task.plannedDate?.slice(0, 10) ?? '',
          actualDate: task.actualDate?.slice(0, 10) ?? '',
          description: task.description ?? '',
        }
      : EMPTY_FORM,
  );
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);

  // The dialog stays mounted while the project list loads, so the create form
  // cannot capture the first option in state at mount. Derive the effective
  // project from the loaded options instead; otherwise the native select shows
  // the first option while the submitted value stays empty and becomes 0.
  const projectId =
    form.projectId || (task ? '' : (projectOptions[0]?.value ?? ''));

  const milestoneOptions = milestones
    .filter((milestone) => String(milestone.projectId) === projectId)
    .map((milestone) => ({
      value: String(milestone.id),
      label: milestone.name,
    }));

  const submit = async (): Promise<void> => {
    setSaving(true);
    setError(undefined);
    try {
      if (task) {
        if (mode === 'status') {
          await api.updateTask(task.id, { status: form.status });
        } else {
          await api.updateTask(task.id, {
            projectId: Number(projectId),
            milestoneId: form.milestoneId ? Number(form.milestoneId) : null,
            assigneeId: form.assigneeId || null,
            name: form.name,
            priority: form.priority,
            status: form.status,
            plannedDate: form.plannedDate || null,
            actualDate: form.actualDate || null,
            description: form.description || null,
          });
        }
      } else {
        await api.createTask({
          projectId: Number(projectId),
          milestoneId: form.milestoneId ? Number(form.milestoneId) : null,
          assigneeId: form.assigneeId || null,
          name: form.name,
          priority: form.priority,
          status: form.status,
          plannedDate: form.plannedDate || null,
          actualDate: form.actualDate || null,
          description: form.description || null,
        });
      }
      onSaved();
    } catch (cause) {
      setError(cause);
    } finally {
      setSaving(false);
    }
  };

  const title = task
    ? t('delivery.tasks.editTitle')
    : t('delivery.tasks.createTitle');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className='grid gap-4 sm:grid-cols-2'
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {mode === 'full' ? (
            <>
              <FormSelect
                id='task-project'
                label={t('delivery.fields.project')}
                value={projectId}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    projectId: value,
                    milestoneId: '',
                  }))
                }
                options={projectOptions}
                required
              />
              <FormInput
                id='task-name'
                label={t('delivery.fields.name')}
                value={form.name}
                onChange={(value) =>
                  setForm((current) => ({ ...current, name: value }))
                }
                required
              />
              <FormSelect
                id='task-milestone'
                label={t('delivery.fields.milestone')}
                value={form.milestoneId}
                onChange={(value) =>
                  setForm((current) => ({ ...current, milestoneId: value }))
                }
                emptyLabel={t('delivery.none')}
                options={milestoneOptions}
              />
              <FormSelect
                id='task-assignee'
                label={t('delivery.fields.assignee')}
                value={form.assigneeId}
                onChange={(value) =>
                  setForm((current) => ({ ...current, assigneeId: value }))
                }
                emptyLabel={t('delivery.unassigned')}
                options={memberOptions}
              />
              <FormSelect
                id='task-priority'
                label={t('delivery.fields.priority')}
                value={form.priority}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    priority: value as TaskPriority,
                  }))
                }
                options={priorityOptions}
              />
            </>
          ) : null}
          <FormSelect
            id='task-status'
            label={t('delivery.fields.status')}
            value={form.status}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                status: value as TaskStatus,
              }))
            }
            options={statusOptions}
          />
          {mode === 'full' ? (
            <>
              <FormInput
                id='task-planned'
                label={t('delivery.fields.plannedDate')}
                type='date'
                value={form.plannedDate}
                onChange={(value) =>
                  setForm((current) => ({ ...current, plannedDate: value }))
                }
              />
              <FormInput
                id='task-actual'
                label={t('delivery.fields.actualDate')}
                type='date'
                value={form.actualDate}
                onChange={(value) =>
                  setForm((current) => ({ ...current, actualDate: value }))
                }
              />
              <div className='sm:col-span-2'>
                <FormTextarea
                  id='task-description'
                  label={t('delivery.fields.description')}
                  value={form.description}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, description: value }))
                  }
                />
              </div>
            </>
          ) : null}
          {task?.status === 'completed' ? (
            <p className='text-sm text-muted-foreground sm:col-span-2'>
              {t('delivery.tasks.completedHint')}
            </p>
          ) : null}
          {error ? (
            <div className='sm:col-span-2'>
              <DeliveryError error={error} />
            </div>
          ) : null}
          <DialogFooter className='sm:col-span-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('delivery.actions.cancel')}
            </Button>
            <Button type='submit' disabled={saving}>
              {t('delivery.actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

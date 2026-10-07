import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PencilIcon, PlusIcon, Trash2Icon, UserMinusIcon } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { Link, Outlet, useParams } from 'react-router';

import { BackButton } from '@/components/back-button';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { ConfirmDialog } from '../confirm-dialog.js';
import { DeliverableList } from '../deliverables.js';
import { AddMemberDialog, MilestoneDialog, TaskDialog } from '../forms.js';
import { formatDate } from '../format.js';
import {
  EmptyHint,
  ErrorState,
  MilestoneStatusBadge,
  PriorityBadge,
  ProgressBar,
  ProjectStatusBadge,
  SectionCard,
  TaskStatusBadge,
} from '../ui.js';
import type {
  Member,
  Milestone,
  ProjectDetail,
  ProjectDetailOutletContext,
  Task,
} from '../types.js';
import { useRemoteData } from '../use-remote-data.js';

function MembersCard({
  detail,
  isOwner,
  reload,
}: {
  readonly detail: ProjectDetail;
  readonly isOwner: boolean;
  readonly reload: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);

  const memberIds = useMemo(
    () => detail.members.map((member) => member.userId),
    [detail.members],
  );

  async function remove(): Promise<boolean> {
    if (!removing) return false;
    try {
      await api.request({
        path: `projects/${encodeURIComponent(detail.project.id)}/members/${encodeURIComponent(removing.userId)}`,
        method: 'DELETE',
      });
      toaster.show({ type: 'success', title: t('projects.members.removed') });
      reload();
      return true;
    } catch (error: unknown) {
      toaster.show({
        type: 'error',
        title:
          error instanceof ApiClientError &&
          error.reason === 'OWNER_CANNOT_BE_REMOVED'
            ? t('projects.members.ownerLocked')
            : t('projects.error.requestFailed'),
      });
      return false;
    }
  }

  return (
    <SectionCard
      action={
        isOwner ? (
          <Button size='sm' variant='outline' onClick={() => setAddOpen(true)}>
            <PlusIcon data-icon='inline-start' />
            {t('projects.members.add')}
          </Button>
        ) : undefined
      }
      description={t('projects.members.description')}
      title={t('projects.members.title')}
    >
      {detail.members.length === 0 ? (
        <EmptyHint>{t('projects.members.empty')}</EmptyHint>
      ) : (
        <ul className='divide-y'>
          {detail.members.map((member) => (
            <li
              key={member.id}
              className='flex items-center justify-between gap-3 py-2'
            >
              <div className='min-w-0'>
                <p className='truncate font-medium'>
                  {member.name ??
                    member.username ??
                    member.email ??
                    member.userId}
                </p>
                <p className='truncate text-sm text-muted-foreground'>
                  {member.email ?? member.userId}
                </p>
              </div>
              <div className='flex shrink-0 items-center gap-2'>
                <span className='text-sm text-muted-foreground'>
                  {t(`projects.memberRole.${member.role}`)}
                </span>
                {isOwner && member.role !== 'owner' ? (
                  <Button
                    aria-label={t('projects.members.remove')}
                    size='icon-sm'
                    variant='ghost'
                    onClick={() => setRemoving(member)}
                  >
                    <UserMinusIcon />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <AddMemberDialog
        excludeIds={memberIds}
        open={addOpen}
        projectId={detail.project.id}
        onOpenChange={setAddOpen}
        onSaved={reload}
      />
      <ConfirmDialog
        description={t('projects.members.removeConfirm', {
          name: removing?.name ?? removing?.userId ?? '',
        })}
        open={removing !== null}
        title={t('projects.members.remove')}
        onConfirm={remove}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      />
    </SectionCard>
  );
}

function MilestonesCard({
  detail,
  isOwner,
  reload,
}: {
  readonly detail: ProjectDetail;
  readonly isOwner: boolean;
  readonly reload: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [createOpen, setCreateOpen] = useState(false);
  const [completing, setCompleting] = useState<Milestone | null>(null);
  const [deleting, setDeleting] = useState<Milestone | null>(null);

  async function complete(): Promise<boolean> {
    if (!completing) return false;
    try {
      await api.request({
        path: `milestones/${encodeURIComponent(completing.id)}/complete`,
        method: 'POST',
      });
      toaster.show({
        type: 'success',
        title: t('projects.milestones.completed'),
      });
      reload();
      return true;
    } catch (error: unknown) {
      toaster.show({
        type: 'error',
        title:
          error instanceof ApiClientError &&
          error.reason === 'MILESTONE_HAS_UNFINISHED_TASKS'
            ? t('projects.milestones.unfinished')
            : t('projects.error.requestFailed'),
      });
      return false;
    }
  }

  async function remove(): Promise<boolean> {
    if (!deleting) return false;
    try {
      await api.request({
        path: `milestones/${encodeURIComponent(deleting.id)}`,
        method: 'DELETE',
      });
      toaster.show({
        type: 'success',
        title: t('projects.milestones.deleted'),
      });
      reload();
      return true;
    } catch {
      toaster.show({
        type: 'error',
        title: t('projects.error.requestFailed'),
      });
      return false;
    }
  }

  return (
    <SectionCard
      action={
        isOwner ? (
          <Button
            size='sm'
            variant='outline'
            onClick={() => setCreateOpen(true)}
          >
            <PlusIcon data-icon='inline-start' />
            {t('projects.milestones.create')}
          </Button>
        ) : undefined
      }
      description={t('projects.milestones.description')}
      title={t('projects.milestones.title')}
    >
      {detail.milestones.length === 0 ? (
        <EmptyHint>{t('projects.milestones.empty')}</EmptyHint>
      ) : (
        <ul className='space-y-3'>
          {detail.milestones.map((milestone) => (
            <li className='space-y-2 rounded-lg border p-3' key={milestone.id}>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='min-w-0'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='font-medium'>{milestone.name}</span>
                    <MilestoneStatusBadge status={milestone.status} />
                  </div>
                  <p className='text-sm text-muted-foreground'>
                    {t('projects.milestones.meta', {
                      completed: milestone.completedTaskCount,
                      total: milestone.taskCount,
                      due:
                        formatDate(milestone.dueDate) ??
                        t('projects.list.noDeadline'),
                    })}
                  </p>
                </div>
                {isOwner ? (
                  <div className='flex shrink-0 items-center gap-2'>
                    {milestone.status !== 'completed' ? (
                      <Button
                        disabled={!milestone.canComplete}
                        size='sm'
                        variant='outline'
                        onClick={() => setCompleting(milestone)}
                      >
                        {t('projects.milestones.complete')}
                      </Button>
                    ) : null}
                    <Button
                      aria-label={t('actions.delete')}
                      size='icon-sm'
                      variant='ghost'
                      onClick={() => setDeleting(milestone)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                ) : null}
              </div>
              {milestone.description ? (
                <p className='text-sm whitespace-pre-wrap text-muted-foreground'>
                  {milestone.description}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <MilestoneDialog
        open={createOpen}
        projectId={detail.project.id}
        onOpenChange={setCreateOpen}
        onSaved={reload}
      />
      <ConfirmDialog
        confirmLabel={t('projects.milestones.complete')}
        description={t('projects.milestones.completeConfirm', {
          name: completing?.name ?? '',
        })}
        open={completing !== null}
        title={t('projects.milestones.complete')}
        onConfirm={complete}
        onOpenChange={(open) => {
          if (!open) setCompleting(null);
        }}
      />
      <ConfirmDialog
        description={t('projects.milestones.deleteConfirm', {
          name: deleting?.name ?? '',
        })}
        open={deleting !== null}
        title={t('projects.milestones.delete')}
        onConfirm={remove}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      />
    </SectionCard>
  );
}

function TaskStatusControl({
  task,
  onChanged,
}: {
  readonly task: Task;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [saving, setSaving] = useState(false);

  const items = [
    'not_started',
    'in_progress',
    'pending_acceptance',
    'completed',
  ].map((value) => ({ value, label: t(`projects.taskStatus.${value}`) }));

  async function change(status: string): Promise<void> {
    setSaving(true);
    try {
      await api.request({
        path: `tasks/${encodeURIComponent(task.id)}`,
        method: 'PATCH',
        json: { status },
      });
      onChanged();
    } catch {
      toaster.show({
        type: 'error',
        title: t('projects.error.requestFailed'),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select
      disabled={saving}
      items={items}
      value={task.status}
      onValueChange={(next) => {
        if (next && next !== task.status) void change(next);
      }}
    >
      <SelectTrigger aria-label={t('projects.fields.status')} size='sm'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function TasksCard({
  detail,
  isOwner,
  reload,
}: {
  readonly detail: ProjectDetail;
  readonly isOwner: boolean;
  readonly reload: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);

  const milestoneNames = useMemo(
    () => new Map(detail.milestones.map((item) => [item.id, item.name])),
    [detail.milestones],
  );

  async function remove(): Promise<boolean> {
    if (!deleting) return false;
    try {
      await api.request({
        path: `tasks/${encodeURIComponent(deleting.id)}`,
        method: 'DELETE',
      });
      toaster.show({ type: 'success', title: t('projects.tasks.deleted') });
      reload();
      return true;
    } catch {
      toaster.show({
        type: 'error',
        title: t('projects.error.requestFailed'),
      });
      return false;
    }
  }

  return (
    <SectionCard
      action={
        isOwner ? (
          <Button
            size='sm'
            variant='outline'
            onClick={() => setCreateOpen(true)}
          >
            <PlusIcon data-icon='inline-start' />
            {t('projects.tasks.create')}
          </Button>
        ) : undefined
      }
      description={t('projects.tasks.description')}
      title={t('projects.tasks.title')}
    >
      {detail.tasks.length === 0 ? (
        <EmptyHint>{t('projects.tasks.empty')}</EmptyHint>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('projects.fields.title')}</TableHead>
              <TableHead>{t('projects.fields.assignee')}</TableHead>
              <TableHead>{t('projects.fields.milestone')}</TableHead>
              <TableHead>{t('projects.fields.priority')}</TableHead>
              <TableHead>{t('projects.fields.dueDate')}</TableHead>
              <TableHead>{t('projects.fields.status')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell className='max-w-[18rem]'>
                  <Link
                    className='font-medium hover:underline'
                    to={`/projects/${detail.project.id}/tasks/${task.id}`}
                  >
                    {task.title}
                  </Link>
                  {task.overdue ? (
                    <span className='ml-2 text-sm text-destructive'>
                      {t('projects.tasks.overdue')}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  {task.assigneeName ?? t('projects.fields.unassigned')}
                </TableCell>
                <TableCell>
                  {task.milestoneId
                    ? (milestoneNames.get(task.milestoneId) ?? '—')
                    : t('projects.fields.noMilestone')}
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={task.priority} />
                </TableCell>
                <TableCell>{formatDate(task.dueDate) ?? '—'}</TableCell>
                <TableCell>
                  {isOwner && task.canUpdate ? (
                    <TaskStatusControl task={task} onChanged={reload} />
                  ) : (
                    <TaskStatusBadge status={task.status} />
                  )}
                </TableCell>
                <TableCell className='text-right'>
                  {isOwner ? (
                    <div className='flex justify-end gap-1'>
                      <Button
                        aria-label={t('projects.tasks.edit')}
                        size='icon-sm'
                        variant='ghost'
                        onClick={() => setEditing(task)}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        aria-label={t('actions.delete')}
                        size='icon-sm'
                        variant='ghost'
                        onClick={() => setDeleting(task)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <TaskDialog
        milestones={detail.milestones}
        open={createOpen}
        projectId={detail.project.id}
        onOpenChange={setCreateOpen}
        onSaved={reload}
      />
      <TaskDialog
        milestones={detail.milestones}
        open={editing !== null}
        projectId={detail.project.id}
        task={editing ?? undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSaved={reload}
      />
      <ConfirmDialog
        description={t('projects.tasks.deleteConfirm', {
          name: deleting?.title ?? '',
        })}
        open={deleting !== null}
        title={t('projects.tasks.delete')}
        onConfirm={remove}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      />
    </SectionCard>
  );
}

function ProjectOverview({
  detail,
}: {
  readonly detail: ProjectDetail;
}): ReactElement {
  const { t } = useTranslation();
  const project = detail.project;
  return (
    <SectionCard
      description={project.description ?? t('projects.list.noDescription')}
      title={t('projects.detail.overview')}
    >
      <dl className='grid gap-4 sm:grid-cols-2'>
        <div className='space-y-1'>
          <dt className='text-sm text-muted-foreground'>
            {t('projects.fields.progress')}
          </dt>
          <dd className='space-y-1'>
            <ProgressBar value={project.progress} />
            <span className='text-sm'>
              {t('projects.list.progress', {
                completed: project.completedTaskCount,
                total: project.taskCount,
              })}{' '}
              · {project.progress}%
            </span>
          </dd>
        </div>
        <div className='space-y-1'>
          <dt className='text-sm text-muted-foreground'>
            {t('projects.fields.startDate')} / {t('projects.fields.endDate')}
          </dt>
          <dd>
            {formatDate(project.startDate) ?? '—'} →{' '}
            {formatDate(project.endDate) ?? '—'}
          </dd>
        </div>
        <div className='space-y-1'>
          <dt className='text-sm text-muted-foreground'>
            {t('projects.fields.owner')}
          </dt>
          <dd>{project.ownerName ?? project.ownerId}</dd>
        </div>
        <div className='space-y-1'>
          <dt className='text-sm text-muted-foreground'>
            {t('projects.fields.myRole')}
          </dt>
          <dd>{t(`projects.memberRole.${project.myRole}`)}</dd>
        </div>
      </dl>
    </SectionCard>
  );
}

/** A project's page: who is on it, what it must reach, what has to be done, and what has been handed in. */
export default function ProjectDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const { data, error, loading, reload } = useRemoteData<ProjectDetail>(
    projectId ? `projects/${encodeURIComponent(projectId)}` : null,
  );

  if (loading && data === undefined) {
    return (
      <PageContainer>
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Spinner />
          {t('status.loading')}
        </div>
      </PageContainer>
    );
  }

  if (error || !data) {
    return (
      <PageContainer>
        <BackButton to='/projects' />
        <ErrorState error={error} onRetry={reload} />
      </PageContainer>
    );
  }

  const project = data.project;
  const isOwner = project.myRole === 'owner';

  return (
    <PageContainer>
      <BackButton to='/projects' />
      <PageHeader
        description={project.description ?? t('projects.list.noDescription')}
        title={
          <span className='flex flex-wrap items-center gap-2'>
            {project.name}
            <ProjectStatusBadge status={project.status} />
          </span>
        }
      />
      <ProjectOverview detail={data} />
      <MembersCard detail={data} isOwner={isOwner} reload={reload} />
      <MilestonesCard detail={data} isOwner={isOwner} reload={reload} />
      <TasksCard detail={data} isOwner={isOwner} reload={reload} />
      <SectionCard
        description={t('projects.deliverables.description')}
        title={t('projects.deliverables.title')}
      >
        <DeliverableList deliverables={data.deliverables} onChanged={reload} />
      </SectionCard>
      <Outlet
        context={{ detail: data, reload } satisfies ProjectDetailOutletContext}
      />
    </PageContainer>
  );
}

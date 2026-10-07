import { useTranslation } from '@nocobase/i18n/client';
import { PaperclipIcon, PencilIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { RouteDrawer } from '@/components/route-drawer';
import { Button } from '@/components/ui/button';

import { DeliverableList } from '../deliverables.js';
import { SubmitDeliverableForm, TaskDialog } from '../forms.js';
import { formatDate } from '../format.js';
import { PriorityBadge, SectionCard, TaskStatusBadge } from '../ui.js';
import type { ProjectDetailOutletContext } from '../types.js';

/**
 * One task in a drawer over the project page: what it asks for, who holds it, and everything handed in for it. The
 * drawer reads the task from the page it opened over, so accepting a deliverable updates both in one place.
 */
export default function TaskDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { taskId } = useParams<{ taskId: string }>();
  const { detail, reload } = useOutletContext<ProjectDetailOutletContext>();
  const [editOpen, setEditOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  const task = detail.tasks.find((item) => item.id === taskId);

  if (!task) {
    return (
      <RouteDrawer title={t('projects.tasks.missing')}>
        <p className='text-sm text-muted-foreground'>
          {t('projects.tasks.missingHint')}
        </p>
      </RouteDrawer>
    );
  }

  const deliverables = detail.deliverables.filter(
    (item) => item.taskId === task.id,
  );
  const milestone = detail.milestones.find(
    (item) => item.id === task.milestoneId,
  );

  return (
    <RouteDrawer
      description={t('projects.tasks.meta', {
        assignee: task.assigneeName ?? t('projects.fields.unassigned'),
        due: formatDate(task.dueDate) ?? t('projects.list.noDeadline'),
      })}
      title={
        <span className='flex flex-wrap items-center gap-2'>
          {task.title}
          <TaskStatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
        </span>
      }
    >
      <div className='space-y-4'>
        <div className='flex flex-wrap items-center gap-2'>
          {task.overdue ? (
            <span className='text-sm text-destructive'>
              {t('projects.tasks.overdue')}
            </span>
          ) : null}
          {milestone ? (
            <span className='text-sm text-muted-foreground'>
              {milestone.name}
            </span>
          ) : null}
          <span className='flex-1' />
          {task.canUpdate ? (
            <Button
              size='sm'
              variant='outline'
              onClick={() => setSubmitOpen((open) => !open)}
            >
              <PaperclipIcon data-icon='inline-start' />
              {t('projects.deliverables.submit')}
            </Button>
          ) : null}
          {detail.project.myRole === 'owner' ? (
            <Button
              size='sm'
              variant='outline'
              onClick={() => setEditOpen(true)}
            >
              <PencilIcon data-icon='inline-start' />
              {t('projects.tasks.edit')}
            </Button>
          ) : null}
        </div>

        {task.description ? (
          <p className='text-sm whitespace-pre-wrap'>{task.description}</p>
        ) : null}

        {submitOpen ? (
          <SectionCard title={t('projects.deliverables.submit')}>
            <SubmitDeliverableForm
              taskId={task.id}
              onCancel={() => setSubmitOpen(false)}
              onSubmitted={() => {
                setSubmitOpen(false);
                reload();
              }}
              onSubmittingChange={() => undefined}
            />
          </SectionCard>
        ) : null}

        <SectionCard
          description={t('projects.deliverables.taskDescription')}
          title={t('projects.deliverables.taskTitle')}
        >
          <DeliverableList deliverables={deliverables} onChanged={reload} />
        </SectionCard>
      </div>

      <TaskDialog
        milestones={detail.milestones}
        open={editOpen}
        projectId={detail.project.id}
        task={task}
        onOpenChange={setEditOpen}
        onSaved={reload}
      />
    </RouteDrawer>
  );
}

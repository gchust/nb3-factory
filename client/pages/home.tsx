import { useTranslation } from '@nocobase/i18n/client';
import {
  CalendarClockIcon,
  CheckCircle2Icon,
  FolderIcon,
  InboxIcon,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

import { formatDate } from './projects/format.js';
import {
  EmptyHint,
  ErrorState,
  ProgressBar,
  ProjectStatusBadge,
  TaskStatusBadge,
} from './projects/ui.js';
import type { Dashboard } from './projects/types.js';
import { useRemoteData } from './projects/use-remote-data.js';

function MetricCard({
  icon,
  label,
  value,
  alert = false,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: number;
  readonly alert?: boolean;
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={
            alert && value > 0
              ? 'font-heading text-2xl font-semibold text-destructive'
              : 'font-heading text-2xl font-semibold'
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

/** The landing page: how the team's projects stand and what the signed-in user owes next. */
export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const { data, error, loading, reload } =
    useRemoteData<Dashboard>('projects/dashboard');

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
        <PageHeader title={t('home.title')} />
        <ErrorState error={error} onRetry={reload} />
      </PageContainer>
    );
  }

  const projectNames = new Map(
    data.projects.map((project) => [project.id, project.name]),
  );

  return (
    <PageContainer>
      <PageHeader description={t('home.description')} title={t('home.title')} />

      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <MetricCard
          icon={<FolderIcon className='size-4' />}
          label={t('home.metrics.projects')}
          value={data.metrics.projectCount}
        />
        <MetricCard
          icon={<InboxIcon className='size-4' />}
          label={t('home.metrics.openTasks')}
          value={data.metrics.openTaskCount}
        />
        <MetricCard
          alert
          icon={<CalendarClockIcon className='size-4' />}
          label={t('home.metrics.overdueTasks')}
          value={data.metrics.overdueTaskCount}
        />
        <MetricCard
          icon={<CheckCircle2Icon className='size-4' />}
          label={t('home.metrics.pendingAcceptance')}
          value={data.metrics.pendingAcceptanceCount}
        />
      </div>

      <div className='grid gap-6 lg:grid-cols-2'>
        <section className='space-y-3'>
          <h2 className='font-heading text-lg font-semibold'>
            {t('home.todos.title')}
          </h2>
          {data.todos.length === 0 ? (
            <EmptyHint>{t('home.todos.empty')}</EmptyHint>
          ) : (
            <ul className='space-y-2'>
              {data.todos.map((task) => (
                <li key={task.id}>
                  <Link
                    className='flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40'
                    to={`/projects/${task.projectId}/tasks/${task.id}`}
                  >
                    <span className='min-w-0 space-y-1'>
                      <span className='block truncate font-medium'>
                        {task.title}
                      </span>
                      <span className='block truncate text-sm text-muted-foreground'>
                        {projectNames.get(task.projectId) ?? ''}
                        {task.dueDate
                          ? ` · ${t('home.todos.due', {
                              date: formatDate(task.dueDate) ?? '',
                            })}`
                          : ''}
                      </span>
                    </span>
                    <span className='flex shrink-0 items-center gap-2'>
                      {task.overdue ? (
                        <span className='text-sm text-destructive'>
                          {t('projects.tasks.overdue')}
                        </span>
                      ) : null}
                      <TaskStatusBadge status={task.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className='space-y-3'>
          <h2 className='font-heading text-lg font-semibold'>
            {t('home.projects.title')}
          </h2>
          {data.projects.length === 0 ? (
            <EmptyHint>{t('home.projects.empty')}</EmptyHint>
          ) : (
            <ul className='space-y-2'>
              {data.projects.map((project) => (
                <li key={project.id}>
                  <Link
                    className='block space-y-2 rounded-lg border p-3 transition-colors hover:border-primary/40'
                    to={`/projects/${project.id}`}
                  >
                    <span className='flex flex-wrap items-center justify-between gap-2'>
                      <span className='font-medium'>{project.name}</span>
                      <ProjectStatusBadge status={project.status} />
                    </span>
                    <ProgressBar value={project.progress} />
                    <span className='flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground'>
                      <span>
                        {t('projects.list.progress', {
                          completed: project.completedTaskCount,
                          total: project.taskCount,
                        })}
                      </span>
                      {project.overdueTaskCount > 0 ? (
                        <span className='text-destructive'>
                          {t('home.projects.overdue', {
                            count: project.overdueTaskCount,
                          })}
                        </span>
                      ) : null}
                      {project.pendingDeliverableCount > 0 ? (
                        <span>
                          {t('home.projects.pending', {
                            count: project.pendingDeliverableCount,
                          })}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageContainer>
  );
}

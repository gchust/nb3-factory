import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

import { formatDate } from './format.js';
import {
  EmptyHint,
  ErrorState,
  ProgressBar,
  ProjectStatusBadge,
} from './ui.js';
import type { Project, ProjectsOutletContext } from './types.js';
import { useRemoteData } from './use-remote-data.js';

function ProjectCard({ project }: { readonly project: Project }): ReactElement {
  const { t } = useTranslation();
  return (
    <Card className='transition-colors hover:border-primary/40'>
      <CardHeader>
        <CardTitle>
          <Link className='hover:underline' to={`/projects/${project.id}`}>
            {project.name}
          </Link>
        </CardTitle>
        <CardDescription>
          {project.description ?? t('projects.list.noDescription')}
        </CardDescription>
        <CardAction>
          <ProjectStatusBadge status={project.status} />
        </CardAction>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='space-y-1'>
          <div className='flex items-center justify-between text-sm text-muted-foreground'>
            <span>
              {t('projects.list.progress', {
                completed: project.completedTaskCount,
                total: project.taskCount,
              })}
            </span>
            <span>{project.progress}%</span>
          </div>
          <ProgressBar
            label={t('projects.fields.progress')}
            value={project.progress}
          />
        </div>
        <dl className='flex flex-wrap gap-x-6 gap-y-1 text-sm'>
          <div className='flex items-center gap-1'>
            <dt className='text-muted-foreground'>
              {t('projects.fields.owner')}
            </dt>
            <dd>{project.ownerName ?? project.ownerId}</dd>
          </div>
          <div className='flex items-center gap-1'>
            <dt className='text-muted-foreground'>
              {t('projects.fields.members')}
            </dt>
            <dd>{project.memberCount}</dd>
          </div>
          <div className='flex items-center gap-1'>
            <dt className='text-muted-foreground'>
              {t('projects.fields.endDate')}
            </dt>
            <dd>
              {formatDate(project.endDate) ?? t('projects.list.noDeadline')}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

/** Every project the signed-in user takes part in, with the one action that starts a new one. */
export default function ProjectsPage(): ReactElement {
  const { t } = useTranslation();
  const { data, error, loading, reload } =
    useRemoteData<readonly Project[]>('projects');

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button render={<Link to='new' />} nativeButton={false}>
            <PlusIcon data-icon='inline-start' />
            {t('projects.create.action')}
          </Button>
        }
        description={t('projects.list.description')}
        title={t('projects.list.title')}
      />
      {loading && data === undefined ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Spinner />
          {t('status.loading')}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data && data.length > 0 ? (
        <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
          {data.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <EmptyHint>{t('projects.list.empty')}</EmptyHint>
      )}
      <Outlet context={{ reload } satisfies ProjectsOutletContext} />
    </PageContainer>
  );
}

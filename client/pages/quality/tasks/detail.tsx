import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { RouteChildPage } from '@/components/route-child-page';
import { TaskDetailPanel } from '@/components/quality/task-detail';

export default function QualityTaskDetailPage(): ReactElement {
  const { taskId } = useParams();
  return (
    <RouteChildPage>
      <PageContainer className='mx-auto max-w-6xl'>
        <Breadcrumbs />
        <TaskDetailPanel taskId={taskId ?? ''} />
      </PageContainer>
    </RouteChildPage>
  );
}

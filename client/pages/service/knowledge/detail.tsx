import { useTranslation } from '@nocobase/i18n/client';
import { useService } from '@nocobase/app-client';
import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { clientFileRepositoryManagerToken } from '../../../extensions/nocobase-file-component-ui/index.js';

import { ErrorState, LoadingState } from '../components/data-states.js';
import { FileAttachments } from '../components/file-attachments.js';
import { formatDateTime, knowledgeStatusLabel } from '../lib/format.js';
import { StatusBadge } from '../components/status-badge.js';
import { useCaller, useServiceClient } from '../lib/use-service.js';
import { useServiceQuery } from '../lib/use-service-query.js';

export default function ServiceKnowledgeDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const client = useServiceClient();
  const caller = useCaller();
  const repositoryManager = useService(clientFileRepositoryManagerToken);
  const repository = repositoryManager.repository('serviceFiles');
  const detail = useServiceQuery(() => client.knowledge(id), `knowledge:${id}`);
  const canManage =
    caller.data?.caller.capabilities['knowledge.manage'] === true;

  return (
    <RouteChildPage>
      <PageContainer className='mx-auto max-w-4xl'>
        <Breadcrumbs />
        {detail.loading && !detail.data ? <LoadingState /> : null}
        {detail.error ? (
          <ErrorState error={detail.error} onRetry={detail.reload} />
        ) : null}
        {detail.data ? (
          <>
            <PageHeader
              actions={
                <StatusBadge
                  label={knowledgeStatusLabel(t, detail.data.article.status)}
                  value={detail.data.article.status}
                />
              }
              description={detail.data.article.summary ?? undefined}
              title={detail.data.article.title}
            />
            <p className='text-xs text-muted-foreground'>
              {t('service.knowledge.updatedAt')}:{' '}
              {formatDateTime(detail.data.article.updatedAt)} ·{' '}
              {t('service.knowledge.views')}: {detail.data.article.viewCount}
            </p>
            <Card>
              <CardHeader>
                <CardTitle>{t('service.knowledge.body')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className='text-sm leading-6 whitespace-pre-wrap'>
                  {detail.data.article.body || '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('service.files.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <FileAttachments
                  canUpload={canManage}
                  files={detail.data.files}
                  onUploaded={async (fileIds) => {
                    await client.attachKnowledgeFiles(id, fileIds);
                    detail.reload();
                  }}
                  repository={repository}
                />
              </CardContent>
            </Card>
          </>
        ) : null}
      </PageContainer>
    </RouteChildPage>
  );
}

import { useApiClient, useToaster, type ApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus, RefreshCw } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

import { listKnowledge, setKnowledgePublished } from '@/api/service';
import { KNOWLEDGE_STATUSES, type RepairKnowledge } from '@/api/service-types';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { FormField, SelectControl } from '@/components/service/form-field';
import { ServiceTable } from '@/components/service/service-table';
import { KnowledgeStatusBadge } from '@/components/service/status-badge';
import { Button } from '@/components/ui/button';
import { useServiceResource } from '@/hooks/use-service-resource';

/**
 * The repair knowledge base.
 *
 * A draft exists for the supervisor alone; an engineer's read action names only
 * the published record access, so the same list endpoint returns the published
 * entries and nothing else. Publishing is a status change, not a grant, and the
 * page shows whichever status the server returned.
 */
export default function ServiceKnowledgePage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [status, setStatus] = useState('');

  const load = useCallback(
    (client: ApiClient, signal: AbortSignal) =>
      listKnowledge(client, { status: status || undefined }, signal),
    [status],
  );
  const knowledge = useServiceResource(`service-knowledge:${status}`, load);
  const canManage = useCan({
    resource: { type: 'composite', id: 'service.knowledge' },
    action: 'manage',
  });
  const outletContext = useMemo(
    () => ({ reload: knowledge.reload }),
    [knowledge.reload],
  );

  async function togglePublished(entry: RepairKnowledge): Promise<void> {
    try {
      await setKnowledgePublished(api, entry.id, entry.status !== 'published');
      toaster.show({
        type: 'success',
        title:
          entry.status === 'published'
            ? t('service.knowledge.unpublished')
            : t('service.knowledge.published'),
      });
      knowledge.reload();
    } catch {
      toaster.show({ type: 'error', title: t('service.errors.title') });
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('service.knowledge.title')}
        description={t('service.knowledge.description')}
        actions={
          <>
            <Button onClick={knowledge.reload} size='sm' variant='outline'>
              <RefreshCw aria-hidden='true' />
              {t('service.actions.refresh')}
            </Button>
            {canManage.can ? (
              <Button render={<Link to='new' />} size='sm'>
                <Plus aria-hidden='true' />
                {t('service.knowledge.createAction')}
              </Button>
            ) : null}
          </>
        }
      />

      <div className='flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4'>
        <FormField
          htmlFor='knowledge-status'
          label={t('service.knowledge.status')}
        >
          <SelectControl
            id='knowledge-status'
            onChange={setStatus}
            options={[
              { value: '', label: t('service.knowledge.allStatuses') },
              ...KNOWLEDGE_STATUSES.map((value) => ({
                value,
                label: t(`service.knowledgeStatus.${value}`),
              })),
            ]}
            value={status}
          />
        </FormField>
      </div>

      {knowledge.error ? (
        <ServiceErrorNotice
          error={knowledge.error}
          onRetry={knowledge.reload}
        />
      ) : null}

      <ServiceTable
        caption={t('service.knowledge.title')}
        columns={[
          {
            key: 'title',
            header: t('service.knowledge.entryTitle'),
            cell: (row: RepairKnowledge) => (
              <Link
                className='font-medium underline-offset-4 hover:underline'
                to={`${row.id}/view`}
              >
                {row.title}
              </Link>
            ),
          },
          {
            key: 'category',
            header: t('service.knowledge.category'),
            cell: (row) => row.category ?? '—',
          },
          {
            key: 'status',
            header: t('service.knowledge.status'),
            cell: (row) => <KnowledgeStatusBadge status={row.status} />,
          },
          {
            key: 'publishedAt',
            header: t('service.knowledge.publishedAt'),
            cell: (row) => row.publishedAt ?? '—',
          },
          {
            key: 'updatedAt',
            header: t('service.knowledge.updatedAt'),
            cell: (row) => row.updatedAt,
          },
          ...(canManage.can
            ? [
                {
                  key: 'actions',
                  header: '',
                  align: 'end' as const,
                  cell: (row: RepairKnowledge) => (
                    <Button
                      onClick={() => {
                        void togglePublished(row);
                      }}
                      size='xs'
                      variant='ghost'
                    >
                      {row.status === 'published'
                        ? t('service.actions.unpublish')
                        : t('service.actions.publish')}
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
        empty={t('service.knowledge.empty')}
        isPending={knowledge.isPending}
        rowKey={(row) => String(row.id)}
        rows={knowledge.data?.data ?? []}
      />

      <Outlet context={outletContext} />
    </PageContainer>
  );
}

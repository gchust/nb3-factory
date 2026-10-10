import { type ApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Pencil } from 'lucide-react';
import { useCallback, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { getKnowledge } from '@/api/service';
import type { RepairKnowledge } from '@/api/service-types';
import { RouteDrawer } from '@/components/route-drawer';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { KnowledgeStatusBadge } from '@/components/service/status-badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useServiceResource } from '@/hooks/use-service-resource';

/**
 * A published knowledge entry, readable by any principal the server lets read
 * it.
 *
 * The list used to link only for a manager, which left a field engineer able to
 * see a title and nothing else. This route renders the body for everyone who
 * can read the record; editing stays behind the manage grant, so the link is
 * shown but the endpoint still refuses an engineer.
 */
export default function KnowledgeDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { knowledgeId } = useParams();
  const id = Number(knowledgeId);
  const load = useCallback(
    (client: ApiClient, signal: AbortSignal) =>
      getKnowledge(client, id, signal),
    [id],
  );
  const entry = useServiceResource<RepairKnowledge>(
    `service-knowledge-entry:${String(id)}`,
    load,
  );
  const canManage = useCan({
    resource: { type: 'composite', id: 'service.knowledge' },
    action: 'manage',
  });

  return (
    <RouteDrawer
      description={entry.data?.category ?? undefined}
      footer={
        canManage.can ? (
          <Button render={<Link to='..' relative='route' />} size='sm'>
            <Pencil aria-hidden='true' />
            {t('service.actions.edit')}
          </Button>
        ) : undefined
      }
      title={entry.data?.title ?? t('service.knowledge.title')}
    >
      {entry.error ? (
        <ServiceErrorNotice error={entry.error} onRetry={entry.reload} />
      ) : null}
      {entry.isPending ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Spinner aria-hidden='true' />
          {t('service.common.loading')}
        </div>
      ) : entry.data ? (
        <article className='space-y-4'>
          <dl className='flex flex-wrap gap-4 text-sm'>
            <div className='space-y-1'>
              <dt className='text-muted-foreground'>
                {t('service.knowledge.status')}
              </dt>
              <dd>
                <KnowledgeStatusBadge status={entry.data.status} />
              </dd>
            </div>
            <div className='space-y-1'>
              <dt className='text-muted-foreground'>
                {t('service.knowledge.publishedAt')}
              </dt>
              <dd>{entry.data.publishedAt ?? '—'}</dd>
            </div>
            <div className='space-y-1'>
              <dt className='text-muted-foreground'>
                {t('service.knowledge.updatedAt')}
              </dt>
              <dd>{entry.data.updatedAt}</dd>
            </div>
          </dl>
          <div className='whitespace-pre-wrap text-sm leading-relaxed'>
            {entry.data.content}
          </div>
        </article>
      ) : null}
    </RouteDrawer>
  );
}

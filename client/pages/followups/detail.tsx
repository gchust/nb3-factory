import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { FileManager } from '@/components/sales/file-manager';
import { Badge, ErrorNotice, Field, Section } from '@/components/sales/ui';
import { formatDate, formatDateTime, useLoad, useSalesApi } from '@/lib/sales';

export default function FollowUpDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const { id = '' } = useParams();
  const state = useLoad(id, () =>
    api.followUp(id).then((response) => response.data),
  );

  return (
    <PageContainer>
      <Link
        to='/followups'
        className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
      >
        <ArrowLeft className='size-4' />
        {t('sales.followups.backToList')}
      </Link>
      {state.error ? <ErrorNotice message={state.error} /> : null}
      {state.loading && !state.data ? (
        <Loading label={t('status.loadingPage')} />
      ) : state.data ? (
        <div className='space-y-6'>
          <PageHeader
            title={formatDateTime(state.data.occurredAt)}
            description={
              <Link
                to={`/customers/${state.data.customerId}`}
                className='text-primary hover:underline'
              >
                {state.data.customerName ?? state.data.customerId}
              </Link>
            }
          />

          <Section title={t('sales.followup.detail')}>
            <div className='grid grid-cols-2 gap-3'>
              <Field label={t('sales.fields.channel')}>
                {t(`sales.channel.${state.data.channel}`)}
              </Field>
              <Field label={t('sales.fields.dueState')}>
                <Badge tone={dueTone(state.data.dueState)}>
                  {t(`sales.due.${state.data.dueState}`)}
                </Badge>
              </Field>
              <Field label={t('sales.fields.relatedOpportunity')}>
                {state.data.opportunityId ? (
                  <Link
                    to={`/opportunities/${state.data.opportunityId}`}
                    className='text-primary hover:underline'
                  >
                    {state.data.opportunityName ?? state.data.opportunityId}
                  </Link>
                ) : (
                  '—'
                )}
              </Field>
              <Field label={t('sales.fields.nextFollowUp')}>
                {formatDate(state.data.nextFollowUpAt)}
              </Field>
              <Field label={t('sales.fields.content')} className='col-span-2'>
                <span className='whitespace-pre-wrap'>
                  {state.data.content}
                </span>
              </Field>
            </div>
          </Section>

          <Section
            title={t('sales.followup.attachments')}
            description={t('sales.followup.attachmentsHint')}
          >
            <FileManager category='followup' followUpId={state.data.id} />
          </Section>
        </div>
      ) : null}
    </PageContainer>
  );
}

function dueTone(due: string): string {
  if (due === 'overdue') return 'danger';
  if (due === 'today') return 'warning';
  if (due === 'upcoming') return 'info';
  return 'neutral';
}

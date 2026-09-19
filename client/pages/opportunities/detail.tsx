import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { FileManager } from '@/components/sales/file-manager';
import { OpportunityFormDialog } from '@/components/sales/forms';
import {
  Badge,
  EmptyState,
  ErrorNotice,
  Field,
  Section,
} from '@/components/sales/ui';
import { Button } from '@/components/ui/button';
import {
  formatAmount,
  formatDate,
  formatDateTime,
  useLoad,
  useSalesApi,
} from '@/lib/sales';

export default function OpportunityDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const { id = '' } = useParams();
  const state = useLoad(id, () =>
    api.opportunity(id).then((response) => response.data),
  );
  const [editing, setEditing] = useState(false);

  return (
    <PageContainer>
      <Link
        to='/opportunities'
        className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
      >
        <ArrowLeft className='size-4' />
        {t('sales.opportunities.backToList')}
      </Link>
      {state.error ? <ErrorNotice message={state.error} /> : null}
      {state.loading && !state.data ? (
        <Loading label={t('status.loadingPage')} />
      ) : state.data ? (
        <div className='space-y-6'>
          <PageHeader
            title={state.data.name}
            description={
              <Link
                to={`/customers/${state.data.customerId}`}
                className='text-primary hover:underline'
              >
                {state.data.customerName ?? state.data.customerId}
              </Link>
            }
            actions={
              <Button
                type='button'
                variant='outline'
                onClick={() => setEditing(true)}
              >
                <Pencil />
                {t('sales.opportunity.edit')}
              </Button>
            }
          />

          <div className='grid gap-6 lg:grid-cols-[1fr_2fr]'>
            <Section title={t('sales.opportunity.detail')}>
              <div className='grid grid-cols-2 gap-3'>
                <Field label={t('sales.fields.amount')}>
                  {formatAmount(state.data.amount)}
                </Field>
                <Field label={t('sales.fields.stage')}>
                  <Badge tone={stageTone(state.data.stage)}>
                    {t(`sales.stage.${state.data.stage}`)}
                  </Badge>
                </Field>
                <Field label={t('sales.fields.expectedCloseDate')}>
                  {formatDate(state.data.expectedCloseDate)}
                </Field>
                <Field label={t('sales.fields.owner')}>
                  {state.data.ownerName ?? '—'}
                </Field>
                <Field
                  label={t('sales.fields.closeReason')}
                  className='col-span-2'
                >
                  <span className='whitespace-pre-wrap'>
                    {state.data.closeReason ?? '—'}
                  </span>
                </Field>
              </div>
            </Section>

            <Section
              title={t('sales.opportunity.documents')}
              description={t('sales.opportunity.documentsHint')}
            >
              <FileManager
                category='opportunity'
                opportunityId={state.data.id}
              />
            </Section>
          </div>

          <Section title={t('sales.followups.title')}>
            {state.data.followUps.length === 0 ? (
              <EmptyState>{t('sales.followups.empty')}</EmptyState>
            ) : (
              <ul className='divide-y divide-border rounded-lg border border-border'>
                {state.data.followUps.map((followUp) => (
                  <li key={followUp.id} className='px-3 py-2'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <Link
                        to={`/followups/${followUp.id}`}
                        className='text-sm font-medium text-primary hover:underline'
                      >
                        {formatDateTime(followUp.occurredAt)} ·{' '}
                        {t(`sales.channel.${followUp.channel}`)}
                      </Link>
                      <Badge tone={dueTone(followUp.dueState)}>
                        {t(`sales.due.${followUp.dueState}`)} ·{' '}
                        {formatDate(followUp.nextFollowUpAt)}
                      </Badge>
                    </div>
                    <p className='mt-1 text-sm text-muted-foreground'>
                      {followUp.content}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {editing ? (
            <OpportunityFormDialog
              key={state.data.id}
              opportunity={state.data}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                state.reload();
              }}
            />
          ) : null}
        </div>
      ) : null}
    </PageContainer>
  );
}

function stageTone(stage: string): string {
  if (stage === 'won') return 'success';
  if (stage === 'lost') return 'danger';
  if (stage === 'negotiation' || stage === 'proposal') return 'info';
  return 'neutral';
}

function dueTone(due: string): string {
  if (due === 'overdue') return 'danger';
  if (due === 'today') return 'warning';
  if (due === 'upcoming') return 'info';
  return 'neutral';
}

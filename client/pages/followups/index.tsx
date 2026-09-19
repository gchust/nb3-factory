import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { FollowUpFormDialog } from '@/components/sales/forms';
import {
  Badge,
  EmptyState,
  ErrorNotice,
  SelectInput,
} from '@/components/sales/ui';
import { Button } from '@/components/ui/button';
import { formatDate, formatDateTime, useLoad, useSalesApi } from '@/lib/sales';

const DUE_STATES = ['overdue', 'today', 'upcoming', 'none'] as const;

export default function FollowUpsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [customerId, setCustomerId] = useState('');
  const [due, setDue] = useState('');
  const [query, setQuery] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const followUps = useLoad(JSON.stringify(query), () =>
    api.followUps(query).then((response) => response.data),
  );
  const customers = useLoad('customers', () =>
    api.customers().then((response) => response.data),
  );

  const apply = (): void => {
    const next: Record<string, string> = {};
    if (customerId) next.customerId = customerId;
    if (due) next.due = due;
    setQuery(next);
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('sales.followups.title')}
        description={t('sales.followups.description')}
        actions={
          <Button type='button' onClick={() => setCreating(true)}>
            {t('sales.followups.create')}
          </Button>
        }
      />

      <form
        className='flex flex-wrap items-end gap-2'
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <SelectInput
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
          aria-label={t('sales.fields.customer')}
          className='w-52'
        >
          <option value=''>{t('sales.followups.allCustomers')}</option>
          {(customers.data ?? []).map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput
          value={due}
          onChange={(event) => setDue(event.target.value)}
          aria-label={t('sales.fields.dueState')}
          className='w-40'
        >
          <option value=''>{t('sales.followups.allDue')}</option>
          {DUE_STATES.map((item) => (
            <option key={item} value={item}>
              {t(`sales.due.${item}`)}
            </option>
          ))}
        </SelectInput>
        <Button type='submit' variant='outline'>
          {t('sales.customers.applyFilters')}
        </Button>
      </form>

      {followUps.error ? <ErrorNotice message={followUps.error} /> : null}
      {followUps.loading && !followUps.data ? (
        <Loading label={t('status.loadingPage')} />
      ) : followUps.data ? (
        followUps.data.length === 0 ? (
          <EmptyState>{t('sales.followups.empty')}</EmptyState>
        ) : (
          <ul className='space-y-2'>
            {followUps.data.map((followUp) => (
              <li
                key={followUp.id}
                className='rounded-xl border border-border bg-background p-4'
              >
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <Link
                    to={`/followups/${followUp.id}`}
                    className='font-medium text-primary hover:underline'
                  >
                    {followUp.customerName ?? followUp.customerId}
                  </Link>
                  <div className='flex items-center gap-2'>
                    <span className='text-xs text-muted-foreground'>
                      {t(`sales.channel.${followUp.channel}`)} ·{' '}
                      {formatDateTime(followUp.occurredAt)}
                    </span>
                    <Badge tone={dueTone(followUp.dueState)}>
                      {t(`sales.due.${followUp.dueState}`)}
                    </Badge>
                  </div>
                </div>
                <p className='mt-2 text-sm text-muted-foreground'>
                  {followUp.content}
                </p>
                <div className='mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground'>
                  {followUp.opportunityName ? (
                    <span>
                      {t('sales.fields.relatedOpportunity')}:{' '}
                      {followUp.opportunityName}
                    </span>
                  ) : null}
                  <span>
                    {t('sales.fields.nextFollowUp')}:{' '}
                    {formatDate(followUp.nextFollowUpAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {creating ? (
        <FollowUpFormDialog
          customers={customers.data ?? []}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            followUps.reload();
          }}
        />
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

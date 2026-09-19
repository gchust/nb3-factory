import { useTranslation } from '@nocobase/i18n/client';
import { Search } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { Loading } from '@/components/loading';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { OpportunityFormDialog } from '@/components/sales/forms';
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorNotice,
  SelectInput,
} from '@/components/sales/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  STAGES,
  formatAmount,
  formatDate,
  useLoad,
  useSalesApi,
} from '@/lib/sales';

export default function OpportunitiesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useSalesApi();
  const [term, setTerm] = useState('');
  const [stage, setStage] = useState('');
  const [query, setQuery] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const opportunities = useLoad(JSON.stringify(query), () =>
    api.opportunities(query).then((response) => response.data),
  );
  const customers = useLoad('customers', () =>
    api.customers().then((response) => response.data),
  );

  const apply = (): void => {
    const next: Record<string, string> = {};
    if (term.trim()) next.q = term.trim();
    if (stage) next.stage = stage;
    setQuery(next);
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('sales.opportunities.title')}
        description={t('sales.opportunities.description')}
        actions={
          <Button type='button' onClick={() => setCreating(true)}>
            {t('sales.opportunities.create')}
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
        <div className='relative min-w-56 flex-1'>
          <Search className='pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground' />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t('sales.opportunities.searchPlaceholder')}
            className='pl-8'
            aria-label={t('sales.opportunities.search')}
          />
        </div>
        <SelectInput
          value={stage}
          onChange={(event) => setStage(event.target.value)}
          aria-label={t('sales.fields.stage')}
          className='w-44'
        >
          <option value=''>{t('sales.opportunities.allStages')}</option>
          {STAGES.map((item) => (
            <option key={item} value={item}>
              {t(`sales.stage.${item}`)}
            </option>
          ))}
        </SelectInput>
        <Button type='submit' variant='outline'>
          {t('sales.customers.applyFilters')}
        </Button>
      </form>

      {opportunities.error ? (
        <ErrorNotice message={opportunities.error} />
      ) : null}
      {opportunities.loading && !opportunities.data ? (
        <Loading label={t('status.loadingPage')} />
      ) : opportunities.data ? (
        opportunities.data.length === 0 ? (
          <EmptyState>{t('sales.opportunities.empty')}</EmptyState>
        ) : (
          <DataTable
            headers={[
              t('sales.fields.opportunityName'),
              t('sales.fields.customer'),
              t('sales.fields.amount'),
              t('sales.fields.stage'),
              t('sales.fields.expectedCloseDate'),
              t('sales.fields.owner'),
            ]}
          >
            {opportunities.data.map((opportunity) => (
              <tr
                key={opportunity.id}
                className='border-b border-border last:border-0'
              >
                <td className='px-3 py-2'>
                  <Link
                    to={`/opportunities/${opportunity.id}`}
                    className='font-medium text-primary hover:underline'
                  >
                    {opportunity.name}
                  </Link>
                </td>
                <td className='px-3 py-2'>
                  <Link
                    to={`/customers/${opportunity.customerId}`}
                    className='text-muted-foreground hover:text-foreground hover:underline'
                  >
                    {opportunity.customerName ?? '—'}
                  </Link>
                </td>
                <td className='px-3 py-2'>
                  {formatAmount(opportunity.amount)}
                </td>
                <td className='px-3 py-2'>
                  <Badge tone={stageTone(opportunity.stage)}>
                    {t(`sales.stage.${opportunity.stage}`)}
                  </Badge>
                </td>
                <td className='px-3 py-2 text-muted-foreground'>
                  {formatDate(opportunity.expectedCloseDate)}
                </td>
                <td className='px-3 py-2 text-muted-foreground'>
                  {opportunity.ownerName ?? '—'}
                </td>
              </tr>
            ))}
          </DataTable>
        )
      ) : null}

      {creating ? (
        <OpportunityFormDialog
          customers={customers.data ?? []}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            opportunities.reload();
          }}
        />
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

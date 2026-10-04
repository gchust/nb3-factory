import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon, TargetIcon } from 'lucide-react';
import { type ReactElement, useCallback, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { EMPTY_VALUE, formatAmount } from '../format.js';
import { ListError, ListSkeleton, SalesEmpty } from '../list-state.js';
import { fetchCustomers, fetchOpportunities } from '../sales-api.js';
import { StageBadge } from '../stage-badge.js';
import {
  OPPORTUNITY_STAGES,
  type Customer,
  type OpportunitiesOutletContext,
  type Opportunity,
  type OpportunityStage,
} from '../types.js';
import { useApiData } from '../use-api-data.js';

type StageFilter = OpportunityStage | 'all';

interface OpportunitiesData {
  readonly opportunities: readonly Opportunity[];
  readonly customers: readonly Customer[];
}

/** Route `/sales/opportunities`: the opportunity list, and the parent of the create and edit dialogs. */
export default function OpportunitiesPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const location = useLocation();
  const api = useApiClient();
  const [stage, setStage] = useState<StageFilter>('all');

  const load = useCallback(
    (signal: AbortSignal): Promise<OpportunitiesData> =>
      Promise.all([
        fetchOpportunities(api, signal, stage === 'all' ? undefined : stage),
        fetchCustomers(api, signal),
      ]).then(([opportunities, customers]) => ({
        opportunities,
        customers,
      })),
    [api, stage],
  );
  const { data, error, loading, reload } = useApiData(load);

  const outletContext = useMemo<OpportunitiesOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const customerNames = useMemo(
    () => new Map((data?.customers ?? []).map((c) => [c.id, c.name])),
    [data],
  );

  const columns = useMemo<ColumnDef<Opportunity, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.opportunities.columns.name')}
          />
        ),
        cell: ({ row }) => (
          <Link
            className='font-medium underline-offset-4 hover:underline'
            to={{
              pathname: `${row.original.id}/edit`,
              search: location.search,
            }}
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'customer',
        accessorFn: (opportunity) =>
          customerNames.get(opportunity.customerId) ??
          String(opportunity.customerId),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.opportunities.columns.customer')}
          />
        ),
        cell: ({ row }) =>
          customerNames.get(row.original.customerId) ?? EMPTY_VALUE,
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.opportunities.columns.amount')}
          />
        ),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatAmount(row.original.amount, locale)}
          </span>
        ),
      },
      {
        accessorKey: 'stage',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.opportunities.columns.stage')}
          />
        ),
        cell: ({ row }) => <StageBadge stage={row.original.stage} />,
        filterFn: 'equals',
      },
    ],
    [t, locale, customerNames, location.search],
  );

  const stageItems = useMemo(
    () => [
      { value: 'all', label: t('sales.opportunities.filter.all') },
      ...OPPORTUNITY_STAGES.map((value) => ({
        value,
        label: t(`sales.opportunities.stage.${value}`),
      })),
    ],
    [t],
  );

  const newButton = (
    <Button
      nativeButton={false}
      render={<Link to={{ pathname: 'new', search: location.search }} />}
    >
      <PlusIcon data-icon='inline-start' />
      {t('sales.opportunities.new')}
    </Button>
  );

  let body: ReactElement;
  if (data === undefined) {
    body = loading ? <ListSkeleton /> : <ListError retry={reload} />;
  } else if (data.opportunities.length === 0 && stage === 'all') {
    body = (
      <SalesEmpty
        icon={<TargetIcon />}
        title={t('sales.opportunities.empty.title')}
        description={t('sales.opportunities.empty.description')}
        action={newButton}
      />
    );
  } else {
    body = (
      <>
        {error ? <ListError retry={reload} /> : null}
        <DataTable
          columns={columns}
          data={[...data.opportunities]}
          showSelectedCount={false}
          emptyMessage={t('sales.opportunities.empty.filtered')}
          toolbar={() => (
            <Select
              items={stageItems}
              value={stage}
              onValueChange={(value) => {
                setStage(value ?? 'all');
              }}
            >
              <SelectTrigger
                size='sm'
                className='w-40'
                aria-label={t('sales.opportunities.filter.label')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stageItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('sales.opportunities.title')}
        description={t('sales.opportunities.description')}
        actions={newButton}
      />
      {body}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

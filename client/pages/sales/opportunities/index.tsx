import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon } from 'lucide-react';
import { type ReactElement, useCallback, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { formatAmount, formatDate } from '../format.js';
import { RemoteData } from '../remote-data.js';
import { STAGE_BADGE_VARIANT, stageLabelKey } from '../stage.js';
import type {
  Customer,
  Opportunity,
  OpportunitiesOutletContext,
} from '../types.js';
import { OPPORTUNITY_STAGES } from '../types.js';
import { useRemoteList } from '../use-remote.js';

type StageFilter = (typeof OPPORTUNITY_STAGES)[number] | 'all';

export default function OpportunitiesPage(): ReactElement {
  const { t } = useTranslation();
  const { search: locationSearch } = useLocation();
  const [stage, setStage] = useState<StageFilter>('all');
  const [search, setSearch] = useState('');
  const opportunities = useRemoteList<Opportunity>('opportunities', {
    stage: stage === 'all' ? undefined : stage,
  });
  const customers = useRemoteList<Customer>('customers');

  const customerNames = useMemo(
    () =>
      new Map(customers.data.map((customer) => [customer.id, customer.name])),
    [customers.data],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return opportunities.data;
    }
    return opportunities.data.filter((opportunity) =>
      opportunity.name.toLowerCase().includes(term),
    );
  }, [opportunities.data, search]);

  const { reload: reloadOpportunities } = opportunities;
  const { reload: reloadCustomers } = customers;
  const reload = useCallback(() => {
    reloadOpportunities();
    reloadCustomers();
  }, [reloadOpportunities, reloadCustomers]);

  const columns = useMemo<ColumnDef<Opportunity>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.fields.name')}
          />
        ),
      },
      {
        id: 'customer',
        accessorFn: (opportunity) =>
          customerNames.get(opportunity.customerId) ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.fields.customer')}
          />
        ),
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.fields.amount')}
            className='justify-end'
          />
        ),
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {formatAmount(row.original.amount)}
          </div>
        ),
      },
      {
        accessorKey: 'stage',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.fields.stage')}
          />
        ),
        cell: ({ row }) => (
          <Badge variant={STAGE_BADGE_VARIANT[row.original.stage]}>
            {t(stageLabelKey(row.original.stage))}
          </Badge>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.fields.updatedAt')}
          />
        ),
        cell: ({ row }) => formatDate(row.original.updatedAt),
      },
      {
        id: 'actions',
        header: () => (
          <span className='sr-only'>{t('sales.fields.actions')}</span>
        ),
        cell: ({ row }) => (
          <Link
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            to={{
              pathname: `${row.original.id}/edit`,
              search: locationSearch,
            }}
          >
            {t('actions.edit')}
          </Link>
        ),
      },
    ],
    [t, locationSearch, customerNames],
  );

  const stageItems = [
    { value: 'all', label: t('sales.stage.all') },
    ...OPPORTUNITY_STAGES.map((value) => ({
      value,
      label: t(stageLabelKey(value)),
    })),
  ];

  const outletContext = useMemo<OpportunitiesOutletContext>(
    () => ({ reload }),
    [reload],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('sales.opportunities.title')}
        description={t('sales.opportunities.description')}
        actions={
          <Link
            className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}
            to={{ pathname: 'new', search: locationSearch }}
          >
            <PlusIcon />
            {t('sales.opportunities.new.action')}
          </Link>
        }
      />
      <RemoteData
        loading={opportunities.loading || customers.loading}
        error={opportunities.error || customers.error}
        reload={reload}
      >
        <DataTable<Opportunity>
          columns={columns}
          data={filtered}
          emptyMessage={t('sales.opportunities.empty')}
          toolbar={(table) => (
            <>
              <Input
                className='max-w-xs'
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('sales.opportunities.search')}
                aria-label={t('sales.opportunities.search')}
              />
              <Select
                items={stageItems}
                value={stage}
                onValueChange={(next) => {
                  if (next) {
                    setStage(next);
                  }
                }}
              >
                <SelectTrigger
                  className='w-44'
                  aria-label={t('sales.opportunities.filterStage')}
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
              <DataTableViewOptions table={table} />
            </>
          )}
        />
      </RemoteData>
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

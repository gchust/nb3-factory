import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useMemo, useState } from 'react';
import { Link, Outlet } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { fetchOpportunities } from '../api.js';
import { formatAmount, useStageLabel } from '../format.js';
import {
  CRM_STAGES,
  type Opportunity,
  type OpportunitiesOutletContext,
} from '../types.js';
import { LoadingState, LoadFailedState } from '../ui.js';
import { useRemoteData } from '../use-remote-data.js';

/** The opportunity list, with its stage filter. */
export default function OpportunitiesPage(): ReactElement {
  const { t } = useTranslation();
  const stageLabel = useStageLabel();
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('all');
  const { data, error, loading, reload } = useRemoteData(
    'opportunities',
    fetchOpportunities,
  );

  const opportunities = useMemo(() => {
    const rows = data ?? [];
    const term = search.trim().toLowerCase();
    return rows.filter((opportunity) => {
      if (stage !== 'all' && opportunity.stage !== stage) return false;
      if (!term) return true;
      return [opportunity.name, opportunity.customer?.name ?? ''].some(
        (value) => value.toLowerCase().includes(term),
      );
    });
  }, [data, search, stage]);

  const stageItems = useMemo(
    () => [
      { value: 'all', label: t('crm.opportunities.allStages') },
      ...CRM_STAGES.map((value) => ({ value, label: stageLabel(value) })),
    ],
    [t, stageLabel],
  );

  const columns = useMemo<ColumnDef<Opportunity, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunities.column.name')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'customer',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunities.column.customer')}
          />
        ),
        cell: ({ row }) =>
          row.original.customer ? (
            <Link
              className='text-primary hover:underline'
              to={`/customers/${row.original.customer.id}`}
            >
              {row.original.customer.name}
            </Link>
          ) : (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunities.column.amount')}
          />
        ),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatAmount(row.original.amount)}
          </span>
        ),
      },
      {
        accessorKey: 'stage',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunities.column.stage')}
          />
        ),
        cell: ({ row }) => <Badge>{stageLabel(row.original.stage)}</Badge>,
      },
      {
        id: 'actions',
        header: () => (
          <span className='sr-only'>{t('crm.column.actions')}</span>
        ),
        cell: ({ row }) => (
          <Button
            size='sm'
            variant='outline'
            nativeButton={false}
            render={<Link to={`${row.original.id}/edit`} />}
          >
            {t('crm.action.edit')}
          </Button>
        ),
      },
    ],
    [t, stageLabel],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.opportunities.title')}
        description={t('crm.opportunities.description')}
        actions={
          <Button nativeButton={false} render={<Link to='new' />}>
            {t('crm.opportunities.new')}
          </Button>
        }
      />
      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <LoadFailedState onRetry={reload} />
      ) : (
        <DataTable
          columns={columns}
          data={opportunities}
          emptyMessage={t('crm.opportunities.empty')}
          toolbar={() => (
            <>
              <Input
                aria-label={t('crm.opportunities.search')}
                placeholder={t('crm.opportunities.search')}
                className='max-w-xs'
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Select
                items={stageItems}
                value={stage}
                onValueChange={(value) => {
                  if (value) setStage(value);
                }}
              >
                <SelectTrigger
                  aria-label={t('crm.opportunities.filterStage')}
                  className='w-44'
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
            </>
          )}
        />
      )}
      <Outlet context={{ reload } satisfies OpportunitiesOutletContext} />
    </PageContainer>
  );
}

import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircleIcon, PlusIcon } from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useAmountFormatter } from '../format.js';
import { useCustomers, useOpportunities } from '../hooks.js';
import {
  OPPORTUNITY_STAGES,
  type CrmListOutletContext,
  type Opportunity,
  type OpportunityStage,
} from '../types.js';

type StageFilter = 'all' | OpportunityStage;

const STAGE_BADGE: Record<
  OpportunityStage,
  'default' | 'secondary' | 'outline'
> = {
  nurturing: 'secondary',
  won: 'default',
  lost: 'outline',
};

/** Route `/opportunities`: the opportunity list with a stage filter. */
export default function OpportunitiesPage(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const formatAmount = useAmountFormatter();
  const [stage, setStage] = useState<StageFilter>('all');
  const opportunities = useOpportunities(stage === 'all' ? undefined : stage);
  const customers = useCustomers();

  const customerNames = useMemo(
    () => new Map(customers.data?.map((item) => [item.id, item.name]) ?? []),
    [customers.data],
  );

  const stageItems = useMemo(
    () => [
      { value: 'all', label: t('crm.opportunities.allStages') },
      ...OPPORTUNITY_STAGES.map((value) => ({
        value,
        label: t(`crm.opportunities.stage.${value}`),
      })),
    ],
    [t],
  );

  const columns = useMemo<ColumnDef<Opportunity, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunities.columns.name')}
          />
        ),
      },
      {
        accessorKey: 'customerId',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunities.columns.customer')}
          />
        ),
        cell: ({ row }) =>
          customerNames.get(row.original.customerId) ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunities.columns.amount')}
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
            title={t('crm.opportunities.columns.stage')}
          />
        ),
        cell: ({ row }) => (
          <Badge variant={STAGE_BADGE[row.original.stage]}>
            {t(`crm.opportunities.stage.${row.original.stage}`)}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: () => null,
        cell: ({ row }) => (
          <div className='text-right'>
            <Link
              className='font-medium text-primary hover:underline'
              to={{
                pathname: `${row.original.id}/edit`,
                search: location.search,
              }}
            >
              {t('crm.common.edit')}
            </Link>
          </div>
        ),
      },
    ],
    [t, customerNames, formatAmount, location.search],
  );

  const outletContext = useMemo<CrmListOutletContext>(
    () => ({ reload: opportunities.reload }),
    [opportunities.reload],
  );

  const error = opportunities.error ?? customers.error;

  let body: ReactElement;
  if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('crm.common.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              opportunities.reload();
              customers.reload();
            }}
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (!opportunities.data) {
    body = (
      <Skeleton
        className='h-64 w-full'
        role='status'
        aria-label={t('status.loading')}
        aria-busy={opportunities.loading}
      />
    );
  } else {
    body = (
      <DataTable
        columns={columns}
        data={opportunities.data}
        showSelectedCount={false}
        emptyMessage={t('crm.opportunities.empty')}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.opportunities.title')}
        description={t('crm.opportunities.description')}
        actions={
          <>
            <Select
              items={stageItems}
              value={stage}
              onValueChange={(value) => {
                if (value) setStage(value);
              }}
            >
              <SelectTrigger
                className='w-40'
                aria-label={t('crm.opportunities.filterLabel')}
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
            <Button
              nativeButton={false}
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
            >
              <PlusIcon data-icon='inline-start' />
              {t('crm.opportunities.new')}
            </Button>
          </>
        }
      />
      {body}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

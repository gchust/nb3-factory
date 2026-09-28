import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, PlusIcon, TargetIcon } from 'lucide-react';
import { type ReactElement, useCallback, useMemo } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

import { listOpportunities } from '../crm/api.js';
import { formatAmount, isOpportunityStage, stageKey } from '../crm/format.js';
import { CrmError, CrmListSkeleton } from '../crm/request-state.js';
import {
  OPPORTUNITY_STAGES,
  type OpportunitiesOutletContext,
  type Opportunity,
  type OpportunityStage,
} from '../crm/types.js';
import { useApiData } from '../crm/use-api-data.js';

const STAGE_VARIANT = {
  following: 'secondary',
  won: 'default',
  lost: 'outline',
} as const;

const ALL_STAGES = 'all';

export default function OpportunitiesPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawStage = searchParams.get('stage');
  const stage: OpportunityStage | undefined = isOpportunityStage(rawStage)
    ? rawStage
    : undefined;
  const stageFilter = stage ?? ALL_STAGES;

  const { data, error, loading, reload } = useApiData(
    `crm:opportunities:${stageFilter}`,
    (signal) =>
      listOpportunities(api, stage === undefined ? {} : { stage }, signal),
  );

  const outletContext = useMemo<OpportunitiesOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const setStageFilter = useCallback(
    (value: string): void => {
      const next = new URLSearchParams(searchParams);
      if (isOpportunityStage(value)) {
        next.set('stage', value);
      } else {
        next.delete('stage');
      }
      // The filter lives in the URL, so the view survives a refresh and is shareable.
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const columns = useMemo<ColumnDef<Opportunity>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunity.fields.name')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'customerName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunity.fields.customer')}
          />
        ),
        cell: ({ row }) =>
          row.original.customerName ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunity.fields.amount')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium tabular-nums'>
            {formatAmount(row.original.amount, i18n.language)}
          </span>
        ),
      },
      {
        accessorKey: 'stage',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunity.fields.stage')}
          />
        ),
        cell: ({ row }) => (
          <Badge variant={STAGE_VARIANT[row.original.stage]}>
            {t(stageKey(row.original.stage))}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: () => (
          <span className='sr-only'>{t('crm.common.actions')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <Link
              className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
              aria-label={t('crm.opportunity.edit.title')}
              to={{
                pathname: `${row.original.id}/edit`,
                search: location.search,
              }}
            >
              <PencilIcon />
            </Link>
          </div>
        ),
      },
    ],
    [t, i18n.language, location.search],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.opportunity.title')}
        description={t('crm.opportunity.description')}
        actions={
          <Link
            className={buttonVariants()}
            to={{ pathname: 'new', search: location.search }}
          >
            <PlusIcon />
            {t('crm.opportunity.create.title')}
          </Link>
        }
      />

      <div className='flex flex-wrap items-center gap-3'>
        <ToggleGroup
          variant='outline'
          size='sm'
          spacing={0}
          value={[stageFilter]}
          onValueChange={(values: string[]) => {
            const [next] = values;
            if (next) setStageFilter(next);
          }}
          aria-label={t('crm.opportunity.filter.label')}
        >
          <ToggleGroupItem value={ALL_STAGES}>
            {t('crm.opportunity.filter.all')}
          </ToggleGroupItem>
          {OPPORTUNITY_STAGES.map((value) => (
            <ToggleGroupItem key={value} value={value}>
              {t(stageKey(value))}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <CrmError error={error} onRetry={reload} />

      {loading && !data ? (
        <CrmListSkeleton />
      ) : data ? (
        <DataTable
          columns={columns}
          data={[...data]}
          emptyMessage={
            stage === undefined
              ? t('crm.opportunity.empty')
              : t('crm.opportunity.emptyForStage', {
                  stage: t(stageKey(stage)),
                })
          }
          toolbar={(table) => (
            <div className='flex w-full items-center gap-2'>
              <TargetIcon className='size-4 text-muted-foreground' />
              <span className='text-sm text-muted-foreground'>
                {t('crm.opportunity.count', { total: data.length })}
              </span>
              <DataTableViewOptions table={table} />
            </div>
          )}
        />
      ) : null}

      <Outlet context={outletContext} />
    </PageContainer>
  );
}

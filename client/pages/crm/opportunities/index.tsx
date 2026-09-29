import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircleIcon, PlusIcon } from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

import { listOpportunities } from '../api.js';
import { formatAmount, formatDate } from '../format.js';
import { OpportunityStageBadge } from '../stage-badge.js';
import {
  OPPORTUNITY_STAGES,
  type ListOutletContext,
  type Opportunity,
  type OpportunityStage,
} from '../types.js';
import { useResource } from '../use-resource.js';

export default function OpportunitiesPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<OpportunityStage | 'all'>('all');

  const { data, loading, error, reload } = useResource(
    `opportunities:${search}:${stage}`,
    () =>
      listOpportunities(api, {
        search: search || undefined,
        stage: stage === 'all' ? undefined : stage,
      }),
  );

  const outletContext = useMemo<ListOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const stageFilterItems = useMemo(
    () => [
      { value: 'all', label: t('crm.opportunities.allStages') },
      ...OPPORTUNITY_STAGES.map((item) => ({
        value: item,
        label: t(`crm.stage.${item}`),
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
            title={t('crm.opportunities.fields.name')}
          />
        ),
        cell: ({ row }) => (
          <Link
            to={{
              pathname: String(row.original.id),
              search: location.search,
            }}
            className='font-medium hover:underline'
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'customerName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunities.fields.customer')}
          />
        ),
        cell: ({ row }) => <span>{row.original.customerName ?? '—'}</span>,
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunities.fields.amount')}
            className='justify-end'
          />
        ),
        cell: ({ row }) => (
          <div className='text-right font-medium tabular-nums'>
            {formatAmount(row.original.amount, locale)}
          </div>
        ),
      },
      {
        accessorKey: 'stage',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunities.fields.stage')}
          />
        ),
        cell: ({ row }) => <OpportunityStageBadge stage={row.original.stage} />,
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunities.fields.updatedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {formatDate(row.original.updatedAt, locale)}
          </span>
        ),
      },
    ],
    [locale, location.search, t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.opportunities.title')}
        description={t('crm.opportunities.description')}
        actions={
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('crm.opportunities.new')}
          </Button>
        }
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>{t('crm.error.requestFailed')}</AlertDescription>
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('actions.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : (
        <DataTable
          columns={columns}
          data={data ?? []}
          getRowId={(opportunity) => String(opportunity.id)}
          emptyMessage={
            loading ? t('status.loading') : t('crm.opportunities.empty')
          }
          toolbar={(table) => (
            <>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setSearch(searchInput.trim());
                }}
                className='flex items-center gap-2'
              >
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder={t('crm.opportunities.searchPlaceholder')}
                  className='max-w-xs'
                  aria-label={t('crm.opportunities.searchPlaceholder')}
                />
                <Button type='submit' variant='outline'>
                  {t('actions.search')}
                </Button>
              </form>
              <Select
                items={stageFilterItems}
                value={stage}
                onValueChange={(value) => {
                  setStage((value as OpportunityStage | 'all') ?? 'all');
                }}
              >
                <SelectTrigger
                  className='w-44'
                  aria-label={t('crm.opportunities.fields.stage')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stageFilterItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DataTableViewOptions
                table={table}
                getColumnLabel={(column) =>
                  t(`crm.opportunities.fields.${column.id}`)
                }
              />
            </>
          )}
        />
      )}

      {loading && data ? (
        <p
          role='status'
          className='flex items-center gap-2 text-sm text-muted-foreground'
        >
          <Spinner data-icon='inline-start' />
          {t('status.loading')}
        </p>
      ) : null}

      <Outlet context={outletContext} />
    </PageContainer>
  );
}

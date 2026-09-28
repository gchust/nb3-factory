import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { BuildingIcon, PlusIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';

import { listCustomers } from '../crm/api.js';
import { formatAmount } from '../crm/format.js';
import { CrmError, CrmListSkeleton } from '../crm/request-state.js';
import type { CustomerSummary, CustomersOutletContext } from '../crm/types.js';
import { useApiData } from '../crm/use-api-data.js';

export default function CustomersPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const location = useLocation();

  const { data, error, loading, reload } = useApiData(
    'crm:customers',
    (signal) => listCustomers(api, signal),
  );

  // Keep the context stable: child routes list its functions as effect dependencies.
  const outletContext = useMemo<CustomersOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const columns = useMemo<ColumnDef<CustomerSummary>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.customer.fields.name')}
          />
        ),
        cell: ({ row }) => (
          <Link
            className='font-medium text-primary underline-offset-4 hover:underline'
            to={{
              pathname: String(row.original.id),
              search: location.search,
            }}
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'industry',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.customer.fields.industry')}
          />
        ),
        cell: ({ row }) =>
          row.original.industry ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'contactCount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.customer.fields.contacts')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground tabular-nums'>
            {row.original.contactCount}
          </span>
        ),
      },
      {
        accessorKey: 'opportunityCount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.customer.fields.opportunities')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground tabular-nums'>
            {row.original.opportunityCount}
          </span>
        ),
      },
      {
        accessorKey: 'opportunityTotal',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.customer.fields.opportunityTotal')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium tabular-nums'>
            {formatAmount(row.original.opportunityTotal, i18n.language)}
          </span>
        ),
      },
    ],
    [t, i18n.language, location.search],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.customer.title')}
        description={t('crm.customer.description')}
        actions={
          <Link
            className={buttonVariants()}
            to={{ pathname: 'new', search: location.search }}
          >
            <PlusIcon />
            {t('crm.customer.create.title')}
          </Link>
        }
      />

      <CrmError error={error} onRetry={reload} />

      {loading && !data ? (
        <CrmListSkeleton />
      ) : data ? (
        <DataTable
          columns={columns}
          data={[...data]}
          emptyMessage={t('crm.customer.empty')}
          toolbar={(table) => (
            <div className='flex w-full items-center gap-2'>
              <BuildingIcon className='size-4 text-muted-foreground' />
              <span className='text-sm text-muted-foreground'>
                {t('crm.customer.count', { total: data.length })}
              </span>
              <DataTableViewOptions table={table} />
            </div>
          )}
        />
      ) : null}

      {/* The create dialog and the detail drawer render here. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

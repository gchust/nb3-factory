import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon, UsersIcon } from 'lucide-react';
import { type ReactElement, useCallback, useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

import { formatDate, EMPTY_VALUE } from '../format.js';
import { ListError, ListSkeleton, SalesEmpty } from '../list-state.js';
import { fetchCustomers } from '../sales-api.js';
import type { Customer, CustomersOutletContext } from '../types.js';
import { useApiData } from '../use-api-data.js';

/** Route `/sales/customers`: the customer list, and the parent of the create dialog and the detail drawer. */
export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const location = useLocation();
  const api = useApiClient();

  const load = useCallback(
    (signal: AbortSignal) => fetchCustomers(api, signal),
    [api],
  );
  const { data, error, loading, reload } = useApiData(load);

  const outletContext = useMemo<CustomersOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const columns = useMemo<ColumnDef<Customer, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.customers.columns.name')}
          />
        ),
        cell: ({ row }) => (
          <Link
            className='font-medium underline-offset-4 hover:underline'
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
            title={t('sales.customers.columns.industry')}
          />
        ),
        cell: ({ row }) => row.original.industry || EMPTY_VALUE,
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.customers.columns.createdAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {formatDate(row.original.createdAt, locale)}
          </span>
        ),
      },
    ],
    [t, locale, location.search],
  );

  let body: ReactElement;
  if (data === undefined) {
    body = loading ? <ListSkeleton /> : <ListError retry={reload} />;
  } else if (data.length === 0) {
    body = (
      <SalesEmpty
        icon={<UsersIcon />}
        title={t('sales.customers.empty.title')}
        description={t('sales.customers.empty.description')}
        action={
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('sales.customers.new')}
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        {error ? <ListError retry={reload} /> : null}
        <DataTable columns={columns} data={data} showSelectedCount={false} />
      </>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('sales.customers.title')}
        description={t('sales.customers.description')}
        actions={
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('sales.customers.new')}
          </Button>
        }
      />
      {body}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

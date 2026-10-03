import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useMemo, useState } from 'react';
import { Link, Outlet } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { fetchCustomers } from './api.js';
import type { CustomersOutletContext, Customer } from './types.js';
import { LoadingState, LoadFailedState } from './ui.js';
import { useRemoteData } from './use-remote-data.js';

/** The customer list: every customer, the entry point to their detail, and create. */
export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const { data, error, loading, reload } = useRemoteData(
    'customers',
    fetchCustomers,
  );

  const customers = useMemo(() => {
    const rows = data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (customer) =>
        customer.name.toLowerCase().includes(term) ||
        (customer.industry ?? '').toLowerCase().includes(term),
    );
  }, [data, search]);

  const columns = useMemo<ColumnDef<Customer, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.customers.column.name')}
          />
        ),
        cell: ({ row }) => (
          <Link
            className='font-medium text-primary hover:underline'
            to={String(row.original.id)}
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
            title={t('crm.customers.column.industry')}
          />
        ),
        cell: ({ row }) =>
          row.original.industry ?? (
            <span className='text-muted-foreground'>—</span>
          ),
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
            render={<Link to={String(row.original.id)} />}
          >
            {t('crm.action.view')}
          </Button>
        ),
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.customers.title')}
        description={t('crm.customers.description')}
        actions={
          <Button nativeButton={false} render={<Link to='new' />}>
            {t('crm.customers.new')}
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
          data={customers}
          emptyMessage={t('crm.customers.empty')}
          toolbar={() => (
            <Input
              aria-label={t('crm.customers.search')}
              placeholder={t('crm.customers.search')}
              className='max-w-xs'
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          )}
        />
      )}
      <Outlet context={{ reload } satisfies CustomersOutletContext} />
    </PageContainer>
  );
}

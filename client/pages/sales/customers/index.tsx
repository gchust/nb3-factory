import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon } from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { formatDate } from '../format.js';
import { RemoteData } from '../remote-data.js';
import type { Customer, CustomersOutletContext } from '../types.js';
import { useRemoteList } from '../use-remote.js';
import { cn } from '@/lib/utils';

export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const { search: locationSearch } = useLocation();
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useRemoteList<Customer>('customers');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return data;
    }
    return data.filter((customer) =>
      customer.name.toLowerCase().includes(term),
    );
  }, [data, search]);

  const columns = useMemo<ColumnDef<Customer>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.fields.name')}
          />
        ),
        cell: ({ row }) => (
          <Link
            className='font-medium underline-offset-4 hover:underline'
            to={{ pathname: String(row.original.id), search: locationSearch }}
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
            title={t('sales.fields.industry')}
          />
        ),
        cell: ({ row }) => row.original.industry ?? '—',
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
    [t, locationSearch],
  );

  const outletContext = useMemo<CustomersOutletContext>(
    () => ({ reload }),
    [reload],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('sales.customers.title')}
        description={t('sales.customers.description')}
        actions={
          <Link
            className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}
            to={{ pathname: 'new', search: locationSearch }}
          >
            <PlusIcon />
            {t('sales.customers.new.action')}
          </Link>
        }
      />
      <RemoteData loading={loading} error={error} reload={reload}>
        <DataTable<Customer>
          columns={columns}
          data={filtered}
          emptyMessage={t('sales.customers.empty')}
          toolbar={(table) => (
            <>
              <Input
                className='max-w-xs'
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('sales.customers.search')}
                aria-label={t('sales.customers.search')}
              />
              <DataTableViewOptions table={table} />
            </>
          )}
        />
      </RemoteData>
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

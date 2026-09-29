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
import { Spinner } from '@/components/ui/spinner';

import { listCustomers } from '../api.js';
import { formatDate } from '../format.js';
import type { Customer, ListOutletContext } from '../types.js';
import { useResource } from '../use-resource.js';

export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const { data, loading, error, reload } = useResource(
    `customers:${search}`,
    () => listCustomers(api, search || undefined),
  );

  // Keep the context passed to child routes stable, so their effects do not run again and again.
  const outletContext = useMemo<ListOutletContext>(
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
            title={t('crm.customers.fields.name')}
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
        accessorKey: 'industry',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.customers.fields.industry')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {row.original.industry ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.customers.fields.updatedAt')}
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
        title={t('crm.customers.title')}
        description={t('crm.customers.description')}
        actions={
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('crm.customers.new')}
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
          getRowId={(customer) => String(customer.id)}
          emptyMessage={
            loading ? t('status.loading') : t('crm.customers.empty')
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
                  placeholder={t('crm.customers.searchPlaceholder')}
                  className='max-w-xs'
                  aria-label={t('crm.customers.searchPlaceholder')}
                />
                <Button type='submit' variant='outline'>
                  {t('actions.search')}
                </Button>
              </form>
              <DataTableViewOptions
                table={table}
                getColumnLabel={(column) =>
                  t(`crm.customers.fields.${column.id}`)
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

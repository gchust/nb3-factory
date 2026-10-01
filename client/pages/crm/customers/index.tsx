import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircleIcon, PlusIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { useCustomers } from '../hooks.js';
import type { CrmListOutletContext, Customer } from '../types.js';

/** Route `/customers`: the customer directory. */
export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const { loading, data, error, reload } = useCustomers();

  const columns = useMemo<ColumnDef<Customer, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.customers.columns.name')}
          />
        ),
        cell: ({ row }) => (
          <Link
            className='font-medium hover:underline'
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
            title={t('crm.customers.columns.industry')}
          />
        ),
        cell: ({ row }) =>
          row.original.industry ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
    ],
    [t, location.search],
  );

  const outletContext = useMemo<CrmListOutletContext>(
    () => ({ reload }),
    [reload],
  );

  let body: ReactElement;
  if (error) {
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>{t('crm.common.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={reload}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (!data) {
    body = (
      <Skeleton
        className='h-64 w-full'
        role='status'
        aria-label={t('status.loading')}
        aria-busy={loading}
      />
    );
  } else {
    body = (
      <DataTable
        columns={columns}
        data={data}
        showSelectedCount={false}
        emptyMessage={t('crm.customers.empty')}
      />
    );
  }

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
      {body}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

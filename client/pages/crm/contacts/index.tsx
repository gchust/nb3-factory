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

import { useContacts, useCustomers } from '../hooks.js';
import type { Contact, CrmListOutletContext } from '../types.js';

/** Route `/contacts`: the contact directory. */
export default function ContactsPage(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const contacts = useContacts();
  const customers = useCustomers();

  const customerNames = useMemo(
    () => new Map(customers.data?.map((item) => [item.id, item.name]) ?? []),
    [customers.data],
  );

  const columns = useMemo<ColumnDef<Contact, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.contacts.columns.name')}
          />
        ),
      },
      {
        accessorKey: 'customerId',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.contacts.columns.customer')}
          />
        ),
        cell: ({ row }) =>
          customerNames.get(row.original.customerId) ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'phone',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.contacts.columns.phone')}
          />
        ),
        cell: ({ row }) =>
          row.original.phone ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'email',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.contacts.columns.email')}
          />
        ),
        cell: ({ row }) =>
          row.original.email ?? (
            <span className='text-muted-foreground'>—</span>
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
    [t, customerNames, location.search],
  );

  const outletContext = useMemo<CrmListOutletContext>(
    () => ({ reload: contacts.reload }),
    [contacts.reload],
  );

  const error = contacts.error ?? customers.error;

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
              contacts.reload();
              customers.reload();
            }}
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (!contacts.data || !customers.data) {
    body = (
      <Skeleton
        className='h-64 w-full'
        role='status'
        aria-label={t('status.loading')}
        aria-busy={contacts.loading || customers.loading}
      />
    );
  } else {
    body = (
      <DataTable
        columns={columns}
        data={contacts.data}
        showSelectedCount={false}
        emptyMessage={t('crm.contacts.empty')}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.contacts.title')}
        description={t('crm.contacts.description')}
        actions={
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('crm.contacts.new')}
          </Button>
        }
      />
      {body}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

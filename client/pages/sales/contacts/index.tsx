import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon } from 'lucide-react';
import { type ReactElement, useCallback, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { RemoteData } from '../remote-data.js';
import type { Contact, ContactsOutletContext, Customer } from '../types.js';
import { useRemoteList } from '../use-remote.js';

export default function ContactsPage(): ReactElement {
  const { t } = useTranslation();
  const { search: locationSearch } = useLocation();
  const [search, setSearch] = useState('');
  const contacts = useRemoteList<Contact>('contacts');
  const customers = useRemoteList<Customer>('customers');

  const customerNames = useMemo(
    () =>
      new Map(customers.data.map((customer) => [customer.id, customer.name])),
    [customers.data],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return contacts.data;
    }
    return contacts.data.filter((contact) => {
      const customerName = customerNames.get(contact.customerId) ?? '';
      return (
        contact.name.toLowerCase().includes(term) ||
        customerName.toLowerCase().includes(term)
      );
    });
  }, [contacts.data, customerNames, search]);

  const { reload: reloadContacts } = contacts;
  const { reload: reloadCustomers } = customers;
  const reload = useCallback(() => {
    reloadContacts();
    reloadCustomers();
  }, [reloadContacts, reloadCustomers]);

  const columns = useMemo<ColumnDef<Contact>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.fields.name')}
          />
        ),
      },
      {
        id: 'customer',
        accessorFn: (contact) => customerNames.get(contact.customerId) ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.fields.customer')}
          />
        ),
      },
      {
        accessorKey: 'phone',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.fields.phone')}
          />
        ),
        cell: ({ row }) => row.original.phone ?? '—',
      },
      {
        accessorKey: 'email',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.fields.email')}
          />
        ),
        cell: ({ row }) => row.original.email ?? '—',
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
    [t, locationSearch, customerNames],
  );

  const outletContext = useMemo<ContactsOutletContext>(
    () => ({ reload }),
    [reload],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('sales.contacts.title')}
        description={t('sales.contacts.description')}
        actions={
          <Link
            className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}
            to={{ pathname: 'new', search: locationSearch }}
          >
            <PlusIcon />
            {t('sales.contacts.new.action')}
          </Link>
        }
      />
      <RemoteData
        loading={contacts.loading || customers.loading}
        error={contacts.error || customers.error}
        reload={reload}
      >
        <DataTable<Contact>
          columns={columns}
          data={filtered}
          emptyMessage={t('sales.contacts.empty')}
          toolbar={(table) => (
            <>
              <Input
                className='max-w-xs'
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('sales.contacts.search')}
                aria-label={t('sales.contacts.search')}
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

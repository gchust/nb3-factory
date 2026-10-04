import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { ContactIcon, PlusIcon } from 'lucide-react';
import { type ReactElement, useCallback, useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

import { EMPTY_VALUE } from '../format.js';
import { ListError, ListSkeleton, SalesEmpty } from '../list-state.js';
import { fetchContacts, fetchCustomers } from '../sales-api.js';
import type { Contact, CustomersOutletContext } from '../types.js';
import { useApiData } from '../use-api-data.js';

interface ContactsData {
  readonly contacts: readonly Contact[];
  readonly customers: readonly { readonly id: number; readonly name: string }[];
}

/** Route `/sales/contacts`: the contact list, and the parent of the create and edit dialogs. */
export default function ContactsPage(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const api = useApiClient();

  const load = useCallback(
    (signal: AbortSignal): Promise<ContactsData> =>
      Promise.all([
        fetchContacts(api, signal),
        fetchCustomers(api, signal),
      ]).then(([contacts, customers]) => ({ contacts, customers })),
    [api],
  );
  const { data, error, loading, reload } = useApiData(load);

  const outletContext = useMemo<CustomersOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const customerNames = useMemo(
    () => new Map((data?.customers ?? []).map((c) => [c.id, c.name])),
    [data],
  );

  const columns = useMemo<ColumnDef<Contact, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.contacts.columns.name')}
          />
        ),
        cell: ({ row }) => (
          <Link
            className='font-medium underline-offset-4 hover:underline'
            to={{
              pathname: `${row.original.id}/edit`,
              search: location.search,
            }}
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'customer',
        accessorFn: (contact) =>
          customerNames.get(contact.customerId) ?? String(contact.customerId),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.contacts.columns.customer')}
          />
        ),
        cell: ({ row }) =>
          customerNames.get(row.original.customerId) ?? EMPTY_VALUE,
      },
      {
        accessorKey: 'phone',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.contacts.columns.phone')}
          />
        ),
        cell: ({ row }) => row.original.phone || EMPTY_VALUE,
      },
      {
        accessorKey: 'email',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.contacts.columns.email')}
          />
        ),
        cell: ({ row }) => row.original.email || EMPTY_VALUE,
      },
    ],
    [t, customerNames, location.search],
  );

  let body: ReactElement;
  if (data === undefined) {
    body = loading ? <ListSkeleton /> : <ListError retry={reload} />;
  } else if (data.contacts.length === 0) {
    body = (
      <SalesEmpty
        icon={<ContactIcon />}
        title={t('sales.contacts.empty.title')}
        description={t('sales.contacts.empty.description')}
        action={<NewContactButton label={t('sales.contacts.new')} />}
      />
    );
  } else {
    body = (
      <>
        {error ? <ListError retry={reload} /> : null}
        <DataTable
          columns={columns}
          data={[...data.contacts]}
          showSelectedCount={false}
        />
      </>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('sales.contacts.title')}
        description={t('sales.contacts.description')}
        actions={<NewContactButton label={t('sales.contacts.new')} />}
      />
      {body}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

function NewContactButton({ label }: { readonly label: string }): ReactElement {
  const location = useLocation();
  return (
    <Button
      nativeButton={false}
      render={<Link to={{ pathname: 'new', search: location.search }} />}
    >
      <PlusIcon data-icon='inline-start' />
      {label}
    </Button>
  );
}

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

import { fetchContacts } from '../api.js';
import type { Contact, ContactsOutletContext } from '../types.js';
import { LoadingState, LoadFailedState } from '../ui.js';
import { useRemoteData } from '../use-remote-data.js';

/** The contact list: every contact with its customer and how to reach them. */
export default function ContactsPage(): ReactElement {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const { data, error, loading, reload } = useRemoteData(
    'contacts',
    fetchContacts,
  );

  const contacts = useMemo(() => {
    const rows = data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((contact) =>
      [
        contact.name,
        contact.email ?? '',
        contact.phone ?? '',
        contact.customer?.name ?? '',
      ].some((value) => value.toLowerCase().includes(term)),
    );
  }, [data, search]);

  const columns = useMemo<ColumnDef<Contact, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.contacts.column.name')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'customer',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.contacts.column.customer')}
          />
        ),
        cell: ({ row }) =>
          row.original.customer ? (
            <Link
              className='text-primary hover:underline'
              to={`/customers/${row.original.customer.id}`}
            >
              {row.original.customer.name}
            </Link>
          ) : (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'phone',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.contacts.column.phone')}
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
            title={t('crm.contacts.column.email')}
          />
        ),
        cell: ({ row }) =>
          row.original.email ?? (
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
            render={<Link to={`${row.original.id}/edit`} />}
          >
            {t('crm.action.edit')}
          </Button>
        ),
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.contacts.title')}
        description={t('crm.contacts.description')}
        actions={
          <Button nativeButton={false} render={<Link to='new' />}>
            {t('crm.contacts.new')}
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
          data={contacts}
          emptyMessage={t('crm.contacts.empty')}
          toolbar={() => (
            <Input
              aria-label={t('crm.contacts.search')}
              placeholder={t('crm.contacts.search')}
              className='max-w-xs'
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          )}
        />
      )}
      <Outlet context={{ reload } satisfies ContactsOutletContext} />
    </PageContainer>
  );
}

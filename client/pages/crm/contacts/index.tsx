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

import { listContacts } from '../api.js';
import { formatDate } from '../format.js';
import type { Contact, ListOutletContext } from '../types.js';
import { useResource } from '../use-resource.js';

export default function ContactsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const { data, loading, error, reload } = useResource(
    `contacts:${search}`,
    () => listContacts(api, { search: search || undefined }),
  );

  const outletContext = useMemo<ListOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const columns = useMemo<ColumnDef<Contact, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.contacts.fields.name')}
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
        accessorKey: 'customerName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.contacts.fields.customer')}
          />
        ),
        cell: ({ row }) => <span>{row.original.customerName ?? '—'}</span>,
      },
      {
        accessorKey: 'phone',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.contacts.fields.phone')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {row.original.phone ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'email',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.contacts.fields.email')}
          />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {row.original.email ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.contacts.fields.updatedAt')}
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
          getRowId={(contact) => String(contact.id)}
          emptyMessage={loading ? t('status.loading') : t('crm.contacts.empty')}
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
                  placeholder={t('crm.contacts.searchPlaceholder')}
                  className='max-w-xs'
                  aria-label={t('crm.contacts.searchPlaceholder')}
                />
                <Button type='submit' variant='outline'>
                  {t('actions.search')}
                </Button>
              </form>
              <DataTableViewOptions
                table={table}
                getColumnLabel={(column) =>
                  t(`crm.contacts.fields.${column.id}`)
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

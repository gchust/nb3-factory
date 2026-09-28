import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, PlusIcon, UsersRoundIcon } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';

import { listContacts } from '../crm/api.js';
import { CrmError, CrmListSkeleton } from '../crm/request-state.js';
import type { Contact, ContactsOutletContext } from '../crm/types.js';
import { useApiData } from '../crm/use-api-data.js';

export default function ContactsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();

  const { data, error, loading, reload } = useApiData(
    'crm:contacts',
    (signal) => listContacts(api, undefined, signal),
  );

  const outletContext = useMemo<ContactsOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const columns = useMemo<ColumnDef<Contact>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.contact.fields.name')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'customerName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.contact.fields.customer')}
          />
        ),
        cell: ({ row }) =>
          row.original.customerName ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'phone',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.contact.fields.phone')}
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
            title={t('crm.contact.fields.email')}
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
          <span className='sr-only'>{t('crm.common.actions')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <Link
              className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
              aria-label={t('crm.contact.edit.title')}
              to={{
                pathname: `${row.original.id}/edit`,
                search: location.search,
              }}
            >
              <PencilIcon />
            </Link>
          </div>
        ),
      },
    ],
    [t, location.search],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.contact.title')}
        description={t('crm.contact.description')}
        actions={
          <Link
            className={buttonVariants()}
            to={{ pathname: 'new', search: location.search }}
          >
            <PlusIcon />
            {t('crm.contact.create.title')}
          </Link>
        }
      />

      <CrmError error={error} onRetry={reload} />

      {loading && !data ? (
        <CrmListSkeleton />
      ) : data ? (
        <DataTable
          columns={columns}
          data={[...data]}
          emptyMessage={t('crm.contact.empty')}
          toolbar={(table) => (
            <div className='flex w-full items-center gap-2'>
              <UsersRoundIcon className='size-4 text-muted-foreground' />
              <span className='text-sm text-muted-foreground'>
                {t('crm.contact.count', { total: data.length })}
              </span>
              <DataTableViewOptions table={table} />
            </div>
          )}
        />
      ) : null}

      <Outlet context={outletContext} />
    </PageContainer>
  );
}

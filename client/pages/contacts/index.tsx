import { useTranslation } from '@nocobase/i18n/client';
import { useApiClient } from '@nocobase/app-client';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

import { listContacts, listCustomers } from '../crm/api.js';
import type { Contact, Customer } from '../crm/types.js';
import { ContactDialog } from './contact-dialog.js';

export default function ContactsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [contacts, setContacts] = useState<readonly Contact[]>([]);
  const [customers, setCustomers] = useState<readonly Customer[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(
    'loading',
  );
  const [listToken, setListToken] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSession, setDialogSession] = useState(0);
  const [editing, setEditing] = useState<Contact | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      listContacts(api, undefined, controller.signal),
      listCustomers(api, controller.signal),
    ]).then(
      ([contactRows, customerRows]) => {
        if (!controller.signal.aborted) {
          setContacts(contactRows);
          setCustomers(customerRows);
          setStatus('ready');
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setStatus('failed');
        }
      },
    );
    return () => controller.abort();
  }, [api, listToken]);

  const customerNames = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer.name])),
    [customers],
  );

  const columns = useMemo<ColumnDef<Contact, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.fields.name', { defaultValue: 'Name' })}
          />
        ),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.name}</span>
        ),
      },
      {
        id: 'customer',
        accessorFn: (contact) => customerNames.get(contact.customerId) ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.fields.customer', { defaultValue: 'Customer' })}
          />
        ),
        cell: ({ row }) =>
          customerNames.get(row.original.customerId) ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'phone',
        header: t('crm.fields.phone', { defaultValue: 'Phone' }),
        cell: ({ row }) =>
          row.original.phone ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'email',
        header: t('crm.fields.email', { defaultValue: 'Email' }),
        cell: ({ row }) =>
          row.original.email ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => (
          <div className='text-right'>
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={t('crm.actions.edit', { defaultValue: 'Edit' })}
              onClick={() => {
                setEditing(row.original);
                setDialogSession((session) => session + 1);
                setDialogOpen(true);
              }}
            >
              <PencilIcon />
            </Button>
          </div>
        ),
      },
    ],
    [t, customerNames],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('crm.contacts.title', { defaultValue: 'Contacts' })}
        description={t('crm.contacts.description', {
          defaultValue: 'The people you work with at each customer.',
        })}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogSession((session) => session + 1);
              setDialogOpen(true);
            }}
            disabled={customers.length === 0}
          >
            <PlusIcon data-icon='inline-start' />
            {t('crm.contacts.create', { defaultValue: 'New contact' })}
          </Button>
        }
      />

      {status === 'loading' ? (
        <div className='flex justify-center py-12'>
          <Spinner />
        </div>
      ) : null}
      {status === 'failed' ? (
        <p className='py-12 text-center text-sm text-muted-foreground'>
          {t('crm.errors.loadFailed', { defaultValue: 'Could not load.' })}
        </p>
      ) : null}
      {status === 'ready' ? (
        <DataTable
          columns={columns}
          data={contacts as Contact[]}
          getRowId={(contact) => String(contact.id)}
          emptyMessage={t('crm.contacts.empty', {
            defaultValue: 'No contacts yet.',
          })}
          toolbar={(table) => (
            <>
              <Input
                placeholder={t('crm.contacts.search', {
                  defaultValue: 'Search contacts…',
                })}
                value={
                  (table.getColumn('name')?.getFilterValue() as
                    string | undefined) ?? ''
                }
                onChange={(event) =>
                  table.getColumn('name')?.setFilterValue(event.target.value)
                }
                className='max-w-xs'
              />
              <DataTableViewOptions
                table={table}
                getColumnLabel={(column) =>
                  column.id === 'name'
                    ? t('crm.fields.name', { defaultValue: 'Name' })
                    : column.id === 'customer'
                      ? t('crm.fields.customer', { defaultValue: 'Customer' })
                      : column.id === 'phone'
                        ? t('crm.fields.phone', { defaultValue: 'Phone' })
                        : t('crm.fields.email', { defaultValue: 'Email' })
                }
              />
            </>
          )}
        />
      ) : null}

      <ContactDialog
        key={dialogSession}
        open={dialogOpen}
        contact={editing}
        customers={customers}
        onOpenChange={setDialogOpen}
        onSaved={() => {
          setStatus('loading');
          setListToken((token) => token + 1);
        }}
      />
    </PageContainer>
  );
}

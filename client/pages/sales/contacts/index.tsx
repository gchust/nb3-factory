import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { DataTableViewOptions } from '@/components/data-table-view-options';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

import { SalesDeleteDialog } from '../sales-delete-dialog';
import {
  salesErrorMessageKey,
  useApiQuery,
  useCustomerOptions,
  useUrlSearch,
  type Contact,
  type NamedRecord,
} from '../shared';

const ALL_CUSTOMERS = 'all';

/** `/sales/contacts`: the contact list. The create dialog and the detail drawer render in its outlet. */
export default function ContactsPage(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useUrlSearch('search');
  const [customerFilter, setCustomerFilter] = useUrlSearch('customerId');
  const { options: customerOptions } = useCustomerOptions();

  const request = useMemo(
    () => ({
      path: 'sales/contacts',
      ...(search || customerFilter
        ? {
            query: {
              ...(search ? { search } : {}),
              ...(customerFilter ? { customerId: customerFilter } : {}),
            },
          }
        : {}),
    }),
    [customerFilter, search],
  );
  const { data, error, loading, reload } = useApiQuery<Contact[]>(request);
  const contacts = data ?? [];

  const [deletion, setDeletion] = useState<{
    readonly open: boolean;
    readonly contact: NamedRecord | null;
  }>({ open: false, contact: null });

  const columns = useMemo<ColumnDef<Contact>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.contact.name')}
          />
        ),
      },
      {
        accessorKey: 'customerName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.contact.customer')}
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
            title={t('sales.contact.phone')}
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
            title={t('sales.contact.email')}
          />
        ),
        cell: ({ row }) =>
          row.original.email ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        id: 'actions',
        enableHiding: false,
        enableSorting: false,
        header: () => (
          <span className='sr-only'>{t('sales.table.actions')}</span>
        ),
        cell: ({ row }) => (
          // The whole row opens the drawer; a click on the menu must not.
          <div
            className='flex justify-end'
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant='ghost' size='icon-sm' />}
              >
                <EllipsisIcon />
                <span className='sr-only'>{t('sales.table.actions')}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem
                  render={
                    <Link
                      to={{
                        pathname: String(row.original.id),
                        search: location.search,
                      }}
                    />
                  }
                >
                  <PencilIcon />
                  {t('sales.contact.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant='destructive'
                  onClick={() =>
                    setDeletion({ open: true, contact: row.original })
                  }
                >
                  <Trash2Icon />
                  {t('sales.contact.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [location.search, t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('sales.contacts.title')}
        description={t('sales.contacts.description')}
        actions={
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('sales.contact.create')}
          </Button>
        }
      />

      {error && contacts.length === 0 ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>{t(salesErrorMessageKey(error))}</AlertDescription>
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('sales.actions.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : (
        <DataTable
          columns={columns}
          data={contacts}
          pageSize={10}
          getRowId={(contact) => String(contact.id)}
          emptyMessage={t('sales.contacts.empty')}
          onRowClick={(row) =>
            void navigate({
              pathname: String(row.original.id),
              search: location.search,
            })
          }
          toolbar={(table) => (
            <>
              <div className='relative max-w-xs flex-1'>
                <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  className='pl-8'
                  placeholder={t('sales.contacts.searchPlaceholder')}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label={t('sales.contacts.searchPlaceholder')}
                />
              </div>
              <Select
                value={customerFilter === '' ? ALL_CUSTOMERS : customerFilter}
                onValueChange={(value) =>
                  setCustomerFilter(
                    value === ALL_CUSTOMERS ? '' : (value ?? ''),
                  )
                }
              >
                <SelectTrigger
                  className='w-48'
                  aria-label={t('sales.contact.customer')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CUSTOMERS}>
                    {t('sales.contacts.allCustomers')}
                  </SelectItem>
                  {customerOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {loading && data !== undefined ? (
                <Spinner aria-label={t('sales.status.loading')} />
              ) : null}
              <DataTableViewOptions
                table={table}
                getColumnLabel={(column) =>
                  t(`sales.contact.columns.${column.id}`)
                }
              />
            </>
          )}
        />
      )}

      <SalesDeleteDialog
        open={deletion.open}
        onOpenChange={(open) =>
          setDeletion((current) => ({ ...current, open }))
        }
        resource='contacts'
        record={deletion.contact}
        onDeleted={() =>
          setDeletion((current) => ({ ...current, open: false }))
        }
      />

      <Outlet />
    </PageContainer>
  );
}

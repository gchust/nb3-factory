import { useTranslation, useLocale } from '@nocobase/i18n/client';
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
import { Link, Outlet, useLocation } from 'react-router';

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
import { Spinner } from '@/components/ui/spinner';

import { SalesDeleteDialog } from '../sales-delete-dialog';
import {
  formatDate,
  salesErrorMessageKey,
  useApiQuery,
  useUrlSearch,
  type Customer,
  type NamedRecord,
} from '../shared';

/** `/sales/customers`: the customer directory. The create dialog and the covered detail page render in its outlet. */
export default function CustomersPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const location = useLocation();
  const [search, setSearch] = useUrlSearch('search');
  const request = useMemo(
    () => ({
      path: 'sales/customers',
      ...(search ? { query: { search } } : {}),
    }),
    [search],
  );
  const { data, error, loading, reload } = useApiQuery<Customer[]>(request);
  const customers = data ?? [];

  const [deletion, setDeletion] = useState<{
    readonly open: boolean;
    readonly customer: NamedRecord | null;
  }>({ open: false, customer: null });

  const columns = useMemo<ColumnDef<Customer>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.customer.name')}
          />
        ),
        cell: ({ row }) => (
          <Button
            className='h-auto max-w-[18rem] justify-start truncate p-0 font-medium'
            variant='link'
            nativeButton={false}
            render={
              <Link
                to={{
                  pathname: String(row.original.id),
                  search: location.search,
                }}
              />
            }
          >
            {row.original.name}
          </Button>
        ),
      },
      {
        accessorKey: 'industry',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.customer.industry')}
          />
        ),
        cell: ({ row }) =>
          row.original.industry ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('sales.customer.createdAt')}
          />
        ),
        cell: ({ row }) => formatDate(locale, row.original.createdAt),
      },
      {
        id: 'actions',
        enableHiding: false,
        enableSorting: false,
        header: () => (
          <span className='sr-only'>{t('sales.table.actions')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
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
                  {t('sales.customer.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant='destructive'
                  onClick={() =>
                    setDeletion({ open: true, customer: row.original })
                  }
                >
                  <Trash2Icon />
                  {t('sales.customer.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [locale, location.search, t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('sales.customers.title')}
        description={t('sales.customers.description')}
        actions={
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('sales.customer.create')}
          </Button>
        }
      />

      {error && customers.length === 0 ? (
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
          data={customers}
          pageSize={10}
          getRowId={(customer) => String(customer.id)}
          emptyMessage={t('sales.customers.empty')}
          toolbar={(table) => (
            <>
              <div className='relative max-w-xs flex-1'>
                <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  className='pl-8'
                  placeholder={t('sales.customers.searchPlaceholder')}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label={t('sales.customers.searchPlaceholder')}
                />
              </div>
              {loading && data !== undefined ? (
                <Spinner aria-label={t('sales.status.loading')} />
              ) : null}
              <DataTableViewOptions
                table={table}
                getColumnLabel={(column) =>
                  t(`sales.customer.columns.${column.id}`)
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
        resource='customers'
        record={deletion.customer}
        onDeleted={() =>
          setDeletion((current) => ({ ...current, open: false }))
        }
      />

      <Outlet />
    </PageContainer>
  );
}

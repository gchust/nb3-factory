import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontalIcon, PencilIcon } from 'lucide-react';
import { type ReactElement, type ReactNode, useMemo } from 'react';
import { Link, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { displayText, type Contact } from '../crm/types.js';

export interface ContactTableProps {
  readonly data: Contact[];
  readonly emptyMessage?: ReactNode;
  /**
   * `true` on the contact list: names link to the detail child route and each
   * row has an "Edit" action. `false` in the customer detail drawer, where the
   * table is a read-only relation list.
   */
  readonly interactive?: boolean;
  /** Hide the customer column when the whole table belongs to one customer. */
  readonly showCustomer?: boolean;
}

/** The contact table shared by the contact list and the customer detail drawer. */
export function ContactTable({
  data,
  emptyMessage,
  interactive = false,
  showCustomer = true,
}: ContactTableProps): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();

  const columns = useMemo<ColumnDef<Contact>[]>(() => {
    const base: ColumnDef<Contact>[] = [
      {
        accessorKey: 'name',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.contact.fields.name')}
          />
        ),
        cell: (context) =>
          interactive ? (
            <Link
              to={{
                pathname: String(context.row.original.id),
                search: location.search,
              }}
              className='font-medium hover:underline'
            >
              {context.row.original.name}
            </Link>
          ) : (
            <span className='font-medium'>{context.row.original.name}</span>
          ),
      },
    ];

    if (showCustomer) {
      base.push({
        accessorKey: 'customerName',
        header: t('crm.contact.fields.customer'),
        cell: ({ row }) => displayText(row.original.customerName),
      });
    }

    base.push(
      {
        accessorKey: 'phone',
        header: t('crm.contact.fields.phone'),
        cell: ({ row }) => displayText(row.original.phone),
      },
      {
        accessorKey: 'email',
        header: t('crm.contact.fields.email'),
        cell: ({ row }) => (
          <span className='wrap-anywhere'>
            {displayText(row.original.email)}
          </span>
        ),
      },
    );

    if (!interactive) return base;

    return [
      ...base,
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('crm.contact.actions.label')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('crm.contact.actions.more', {
                      name: row.original.name,
                    })}
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    render={
                      <Link
                        to={{
                          pathname: `${row.original.id}/edit`,
                          search: location.search,
                        }}
                      />
                    }
                  >
                    <PencilIcon />
                    {t('crm.contact.actions.edit')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ];
  }, [interactive, location.search, showCustomer, t]);

  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(row) => String(row.id)}
      emptyMessage={emptyMessage}
      showSelectedCount={false}
    />
  );
}

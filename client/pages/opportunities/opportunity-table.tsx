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

import { OpportunityStageBadge } from '../crm/stage-badge.js';
import { displayText, type Opportunity } from '../crm/types.js';

export interface OpportunityTableProps {
  readonly data: Opportunity[];
  readonly locale: string;
  readonly emptyMessage?: ReactNode;
  /**
   * `true` on the opportunity list: names link to the detail child route and
   * each row has an "Edit" action. `false` where the table is a read-only
   * relation list, as in the customer detail drawer.
   */
  readonly interactive?: boolean;
}

/** The opportunity table shared by the opportunity list and the customer detail drawer. */
export function OpportunityTable({
  data,
  locale,
  emptyMessage,
  interactive = false,
}: OpportunityTableProps): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();

  const amountFormat = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [locale],
  );

  const columns = useMemo<ColumnDef<Opportunity>[]>(() => {
    const base: ColumnDef<Opportunity>[] = [
      {
        accessorKey: 'name',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunity.fields.name')}
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
      {
        accessorKey: 'customerName',
        header: t('crm.opportunity.fields.customer'),
        cell: ({ row }) => displayText(row.original.customerName),
      },
      {
        accessorKey: 'amount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('crm.opportunity.fields.amount')}
            className='justify-end'
          />
        ),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {amountFormat.format(row.original.amount)}
          </span>
        ),
      },
      {
        accessorKey: 'stage',
        header: t('crm.opportunity.fields.stage'),
        cell: ({ row }) => <OpportunityStageBadge stage={row.original.stage} />,
      },
    ];

    if (!interactive) return base;

    return [
      ...base,
      {
        id: 'actions',
        enableHiding: false,
        header: () => (
          <span className='sr-only'>{t('crm.opportunity.actions.label')}</span>
        ),
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('crm.opportunity.actions.more', {
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
                    {t('crm.opportunity.actions.edit')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ];
  }, [amountFormat, interactive, location.search, t]);

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

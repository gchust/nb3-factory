import type { Column } from '@tanstack/react-table';
import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  EyeOffIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { cn } from 'cn';

export interface DataTableColumnHeaderProps<TData, TValue> {
  readonly column: Column<TData, TValue>;
  readonly title: string;
  readonly className?: string;
}

/**
 * A sortable column's header. It renders the title alone when the column cannot sort, and otherwise a menu with
 * "ascending", "descending" and, when the column can be hidden, "hide".
 */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>): ReactElement {
  const { t } = useTranslation();

  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant='ghost'
              size='sm'
              className='data-open:bg-muted -ml-2.5'
            />
          }
        >
          <span>{title}</span>
          {column.getIsSorted() === 'desc' ? (
            <ArrowDownIcon />
          ) : column.getIsSorted() === 'asc' ? (
            <ArrowUpIcon />
          ) : (
            <ChevronsUpDownIcon />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start'>
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <ArrowUpIcon />
            {t('dataTable.sortAscending')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <ArrowDownIcon />
            {t('dataTable.sortDescending')}
          </DropdownMenuItem>
          {column.getCanHide() ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                <EyeOffIcon />
                {t('dataTable.hideColumn')}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

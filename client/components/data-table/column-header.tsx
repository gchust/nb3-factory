import type { Column } from '@tanstack/react-table';
import { useTranslation } from '@nocobase/i18n/client';
import { cn } from 'cn';
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

export interface DataTableColumnHeaderProps<TData, TValue> {
  readonly column: Column<TData, TValue>;
  readonly title: string;
  readonly className?: string;
}

/**
 * A column header that can sort, and can hide its column. A column that cannot sort renders as plain text. Pass
 * `enableHiding: false` in the column definition when the page offers no way to bring a hidden column back.
 */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>): ReactElement {
  const { t } = useTranslation();

  if (!column.getCanSort()) {
    return <div className={className}>{title}</div>;
  }

  const sorted = column.getIsSorted();

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant='ghost'
              size='sm'
              className='-ml-2 h-8 data-open:bg-muted'
            />
          }
        >
          <span>{title}</span>
          {sorted === 'desc' ? (
            <ArrowDownIcon />
          ) : sorted === 'asc' ? (
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

import { useTranslation } from '@nocobase/i18n/client';
import type { Column } from '@tanstack/react-table';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  EyeOffIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';

import { cn } from 'cn';

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

/** A sortable column header: a menu with ascending, descending and, when allowed, hide. */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>): ReactElement {
  const { t } = useTranslation();

  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  const sorted = column.getIsSorted();
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant='ghost' size='sm' className='-ml-2 h-8' />}
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

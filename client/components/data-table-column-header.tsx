import type { Column } from '@tanstack/react-table';
import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  EyeOffIcon,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { cn } from 'cn';

import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';

export interface DataTableColumnHeaderProps<TData, TValue> {
  readonly column: Column<TData, TValue>;
  readonly title: ReactNode;
  readonly className?: string;
}

/**
 * A sortable column header: a menu with "Ascending", "Descending" and "Hide".
 *
 * A plain column never uses this; its `header` is the translated title itself, so no "Hide" appears for a column that
 * has no way back.
 */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>): ReactElement {
  const { t } = useTranslation();
  const sorted = column.getIsSorted();

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
              className='-ml-3 data-popup-open:bg-accent'
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
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
              <ArrowUpIcon className='text-muted-foreground/70' />
              {t('dataTable.sortAscending')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
              <ArrowDownIcon className='text-muted-foreground/70' />
              {t('dataTable.sortDescending')}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {column.getCanHide() ? (
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                <EyeOffIcon className='text-muted-foreground/70' />
                {t('dataTable.hideColumn')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

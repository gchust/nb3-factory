import { useTranslation } from '@nocobase/i18n/client';
import type { Column } from '@tanstack/react-table';
import { cn } from 'cn';
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  EyeOffIcon,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

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
  readonly title: ReactNode;
  readonly className?: string;
}

/**
 * A column header with a sort menu and, when the column can be hidden, a "Hide" action. A column without sorting
 * renders its title as plain text.
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

  const sorted = column.getIsSorted();

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant='ghost'
              size='sm'
              className='-ml-2 data-open:bg-muted'
            />
          }
        >
          {title}
          {sorted === 'desc' ? (
            <ArrowDownIcon data-icon='inline-end' />
          ) : sorted === 'asc' ? (
            <ArrowUpIcon data-icon='inline-end' />
          ) : (
            <ArrowUpDownIcon data-icon='inline-end' />
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

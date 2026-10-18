import { useTranslation } from '@nocobase/i18n/client';
import type { Column, Table } from '@tanstack/react-table';
import { Settings2Icon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';

export interface DataTableViewOptionsProps<TData> {
  readonly table: Table<TData>;
  /** The label of a column; without it the menu lists the raw column id. */
  readonly getColumnLabel?: (column: Column<TData>) => ReactNode;
}

/** The "Toggle columns" menu, for a `DataTable` that offers column hiding. */
export function DataTableViewOptions<TData>({
  table,
  getColumnLabel,
}: DataTableViewOptionsProps<TData>): ReactElement {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant='outline'
            size='sm'
            className='ml-auto hidden lg:inline-flex'
          />
        }
      >
        <Settings2Icon />
        {t('dataTable.view')}
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-40'>
        <DropdownMenuGroup>
          {table
            .getAllColumns()
            .filter(
              (column) =>
                typeof column.accessorFn !== 'undefined' && column.getCanHide(),
            )
            .map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(checked) => column.toggleVisibility(checked)}
              >
                {getColumnLabel ? getColumnLabel(column) : column.id}
              </DropdownMenuCheckboxItem>
            ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

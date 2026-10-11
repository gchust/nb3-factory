import type { Table } from '@tanstack/react-table';
import { useTranslation } from '@nocobase/i18n/client';
import { Settings2Icon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';

export interface DataTableViewOptionsProps<TData> {
  readonly table: Table<TData>;
  /**
   * The translated label of a column. Without it the menu lists the raw `column.id`, which is not user-facing copy.
   */
  readonly getColumnLabel?: (columnId: string) => string;
}

/** The "Toggle columns" menu. Render it through `DataTable`'s `toolbar` prop, with `getColumnLabel`. */
export function DataTableViewOptions<TData>({
  table,
  getColumnLabel,
}: DataTableViewOptionsProps<TData>): ReactElement {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant='outline' size='sm' className='ml-auto' />}
      >
        <Settings2Icon />
        {t('dataTable.view')}
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-40'>
        <DropdownMenuLabel>{t('dataTable.toggleColumns')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== 'undefined' && column.getCanHide(),
          )
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              className='capitalize'
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(!!value)}
            >
              {getColumnLabel?.(column.id) ?? column.id}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

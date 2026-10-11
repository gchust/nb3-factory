import type { Column, Table } from '@tanstack/react-table';
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
  /** Translates a column's label; without it the menu shows the raw column id. */
  readonly getColumnLabel?: (column: Column<TData, unknown>) => string;
}

/**
 * The "View" menu that shows or hides the hideable columns. It is hidden below `lg`, so a page that offers no other
 * way to restore a hidden column should set `enableHiding: false` on it instead of relying on this menu.
 */
export function DataTableViewOptions<TData>({
  table,
  getColumnLabel,
}: DataTableViewOptionsProps<TData>): ReactElement {
  const { t } = useTranslation();
  const columns = table.getAllColumns().filter((column) => column.getCanHide());

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant='outline' size='sm' className='ml-auto h-8' />}
      >
        <Settings2Icon />
        {t('dataTable.view')}
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-40'>
        <DropdownMenuLabel>{t('dataTable.toggleColumns')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={column.getIsVisible()}
            onCheckedChange={(value) => column.toggleVisibility(!!value)}
          >
            {getColumnLabel ? getColumnLabel(column) : column.id}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

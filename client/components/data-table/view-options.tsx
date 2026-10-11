import { useTranslation } from '@nocobase/i18n/client';
import type { Column, Table as TableInstance } from '@tanstack/react-table';
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
  readonly table: TableInstance<TData>;
  /** The label shown for a column; without it the column id is shown. Pass a translated label. */
  readonly getColumnLabel?: (column: Column<TData, unknown>) => string;
}

/** The "View" menu that toggles the columns a table can hide. */
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
            className='ml-auto hidden lg:flex'
          />
        }
      >
        <Settings2Icon />
        {t('dataTable.view')}
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuLabel>{t('dataTable.toggleColumns')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter((column) => column.getCanHide())
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              className='capitalize'
              checked={column.getIsVisible()}
              onCheckedChange={(value: boolean) =>
                column.toggleVisibility(!!value)
              }
            >
              {getColumnLabel ? getColumnLabel(column) : column.id}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

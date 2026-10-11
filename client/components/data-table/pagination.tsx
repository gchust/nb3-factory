import type { Table } from '@tanstack/react-table';
import { useTranslation } from '@nocobase/i18n/client';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from 'lucide-react';
import { type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';

export interface DataTablePaginationProps<TData> {
  readonly table: Table<TData>;
  readonly pageSizeOptions?: readonly number[];
  /** `false` omits the "N of M row(s) selected." summary on a table without row selection. */
  readonly showSelectedCount?: boolean;
}

/** The pagination bar under `DataTable`: rows per page, the current page, and the four page buttons. */
export function DataTablePagination<TData>({
  table,
  pageSizeOptions = [10, 20, 30, 40, 50],
  showSelectedCount = true,
}: DataTablePaginationProps<TData>): ReactElement {
  const { t } = useTranslation();
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = Math.max(table.getPageCount(), 1);

  const items = pageSizeOptions.map((size) => ({
    value: String(size),
    label: String(size),
  }));

  return (
    <div className='flex flex-wrap items-center justify-between gap-4 px-2 pt-4'>
      <div className='text-sm text-muted-foreground'>
        {showSelectedCount
          ? t('dataTable.selectedCount', {
              selected: table.getFilteredSelectedRowModel().rows.length,
              total: table.getFilteredRowModel().rows.length,
            })
          : null}
      </div>
      <div className='flex flex-wrap items-center gap-4'>
        <div className='flex items-center gap-2'>
          <span className='text-sm text-muted-foreground'>
            {t('dataTable.rowsPerPage')}
          </span>
          <Select
            items={items}
            value={String(pageSize)}
            onValueChange={(value) => {
              if (value) table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger
              size='sm'
              className='w-[4.5rem]'
              aria-label={t('dataTable.rowsPerPage')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <span className='text-sm text-muted-foreground'>
          {t('dataTable.pageOf', { page: pageIndex + 1, pageCount })}
        </span>
        <div className='flex items-center gap-1'>
          <Button
            variant='outline'
            size='icon-sm'
            onClick={() => table.firstPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label={t('dataTable.firstPage')}
          >
            <ChevronsLeftIcon />
          </Button>
          <Button
            variant='outline'
            size='icon-sm'
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label={t('dataTable.previousPage')}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant='outline'
            size='icon-sm'
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label={t('dataTable.nextPage')}
          >
            <ChevronRightIcon />
          </Button>
          <Button
            variant='outline'
            size='icon-sm'
            onClick={() => table.lastPage()}
            disabled={!table.getCanNextPage()}
            aria-label={t('dataTable.lastPage')}
          >
            <ChevronsRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}

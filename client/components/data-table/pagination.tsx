import { useTranslation } from '@nocobase/i18n/client';
import type { Table } from '@tanstack/react-table';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '#components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

export interface DataTablePaginationProps<TData> {
  readonly table: Table<TData>;
  readonly pageSizeOptions?: readonly number[];
  /** When `false`, the "N of M rows selected" summary is left out. */
  readonly showSelectedCount?: boolean;
}

/** The pagination bar under a `DataTable`: rows per page, the page number and the four step buttons. */
export function DataTablePagination<TData>({
  table,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
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
    <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2'>
      <div className='flex-1 text-sm text-muted-foreground'>
        {showSelectedCount
          ? t('dataTable.selectedCount', {
              selected: table.getFilteredSelectedRowModel().rows.length,
              total: table.getFilteredRowModel().rows.length,
            })
          : null}
      </div>
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
      <div className='text-sm'>
        {t('dataTable.pageOf', { page: pageIndex + 1, pageCount })}
      </div>
      <div className='flex items-center gap-1'>
        <Button
          variant='outline'
          size='icon-sm'
          onClick={() => table.setPageIndex(0)}
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
          onClick={() => table.setPageIndex(pageCount - 1)}
          disabled={!table.getCanNextPage()}
          aria-label={t('dataTable.lastPage')}
        >
          <ChevronsRightIcon />
        </Button>
      </div>
    </div>
  );
}

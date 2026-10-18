import type { Table } from '@tanstack/react-table';
import { useTranslation } from '@nocobase/i18n/client';
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

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50] as const;

export interface DataTablePaginationProps<TData> {
  readonly table: Table<TData>;
  /** A table without row selection passes `false`, so the bar does not say "0 of N row(s) selected". */
  readonly showSelectedCount?: boolean;
  /** The rows-per-page choices; defaults to 10, 20, 30, 40 and 50. */
  pageSizeOptions?: readonly number[];
}

/** The rows-per-page select, the page counter and the four page buttons below a table. */
export function DataTablePagination<TData>({
  table,
  showSelectedCount = true,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: DataTablePaginationProps<TData>): ReactElement {
  const { t } = useTranslation();
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();

  const pageSizeItems = pageSizeOptions.map((size) => ({
    value: String(size),
    label: String(size),
  }));

  return (
    <div className='flex flex-wrap items-center justify-between gap-4 px-1'>
      <p className='flex-1 text-sm text-muted-foreground'>
        {showSelectedCount
          ? t('dataTable.selectedCount', {
              selected: table.getFilteredSelectedRowModel().rows.length,
              total: table.getFilteredRowModel().rows.length,
            })
          : null}
      </p>
      <div className='flex flex-wrap items-center gap-4 sm:gap-6'>
        <div className='flex items-center gap-2'>
          <p className='text-sm font-medium'>{t('dataTable.rowsPerPage')}</p>
          <Select
            items={pageSizeItems}
            value={String(pageSize)}
            onValueChange={(value: string | null) => {
              if (value) table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger
              size='sm'
              className='w-18'
              aria-label={t('dataTable.rowsPerPage')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {pageSizeItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <p className='text-sm font-medium'>
          {t('dataTable.pageOf', { page: pageIndex + 1, pageCount })}
        </p>
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
    </div>
  );
}

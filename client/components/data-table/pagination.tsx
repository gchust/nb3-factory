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

export interface DataTablePaginationProps<TData> {
  readonly table: Table<TData>;
  readonly pageSizeOptions: number[];
  readonly showSelectedCount?: boolean;
}

/** The pagination bar below the table: rows-per-page, page position and page navigation. */
export function DataTablePagination<TData>({
  table,
  pageSizeOptions,
  showSelectedCount = true,
}: DataTablePaginationProps<TData>): ReactElement {
  const { t } = useTranslation();
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = Math.max(table.getPageCount(), 1);
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;
  const total = table.getFilteredRowModel().rows.length;

  const pageSizeItems = pageSizeOptions.map((size) => ({
    value: String(size),
    label: String(size),
  }));

  return (
    <div className='flex flex-wrap items-center justify-between gap-4'>
      <div className='flex-1 text-sm text-muted-foreground'>
        {showSelectedCount
          ? t('dataTable.selectedCount', {
              selected: selectedCount,
              total,
            })
          : null}
      </div>
      <div className='flex flex-wrap items-center gap-4 sm:gap-6 lg:gap-8'>
        <div className='flex items-center gap-2'>
          <p className='text-sm font-medium'>{t('dataTable.rowsPerPage')}</p>
          <Select
            items={pageSizeItems}
            value={String(pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger size='sm' className='w-18'>
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
        <div className='text-sm font-medium'>
          {t('dataTable.pageOf', {
            page: pageIndex + 1,
            pageCount,
          })}
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='icon-sm'
            className='hidden lg:inline-flex'
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.setPageIndex(0)}
            aria-label={t('dataTable.firstPage')}
          >
            <ChevronsLeftIcon />
          </Button>
          <Button
            variant='outline'
            size='icon-sm'
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            aria-label={t('dataTable.previousPage')}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant='outline'
            size='icon-sm'
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            aria-label={t('dataTable.nextPage')}
          >
            <ChevronRightIcon />
          </Button>
          <Button
            variant='outline'
            size='icon-sm'
            className='hidden lg:inline-flex'
            disabled={!table.getCanNextPage()}
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            aria-label={t('dataTable.lastPage')}
          >
            <ChevronsRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}

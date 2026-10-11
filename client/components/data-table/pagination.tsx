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
  /** Defaults to `true`; a table without row selection passes `false` so it shows no "0 of N row(s) selected". */
  readonly showSelectedCount?: boolean;
  readonly pageSizeOptions?: readonly number[];
}

/** The pagination bar below a table: rows per page, the page summary, and first/previous/next/last. */
export function DataTablePagination<TData>({
  table,
  showSelectedCount = true,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: DataTablePaginationProps<TData>): ReactElement {
  const { t } = useTranslation();
  const pageSizeItems = pageSizeOptions.map((value) => ({
    value: String(value),
    label: String(value),
  }));

  return (
    <div className='flex flex-wrap items-center justify-between gap-3 px-2'>
      <div className='flex-1 text-sm text-muted-foreground'>
        {showSelectedCount
          ? t('dataTable.selectedCount', {
              selected: table.getFilteredSelectedRowModel().rows.length,
              total: table.getFilteredRowModel().rows.length,
            })
          : null}
      </div>
      <div className='flex flex-wrap items-center gap-4 lg:gap-6'>
        <div className='flex items-center gap-2'>
          <p className='text-sm font-medium'>{t('dataTable.rowsPerPage')}</p>
          <Select
            items={pageSizeItems}
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger size='sm' aria-label={t('dataTable.rowsPerPage')}>
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
        <div className='flex items-center gap-1 text-sm font-medium'>
          {t('dataTable.pageOf', {
            page: table.getState().pagination.pageIndex + 1,
            pageCount: table.getPageCount(),
          })}
        </div>
        <div className='flex items-center gap-1'>
          <Button
            variant='outline'
            size='icon-sm'
            className='hidden lg:flex'
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
            className='hidden lg:flex'
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
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

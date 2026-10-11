import { useTranslation } from '@nocobase/i18n/client';
import type { Table as TableInstance } from '@tanstack/react-table';
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
  readonly table: TableInstance<TData>;
  /** `false` on a table without row selection, so the count is omitted. */
  readonly showSelectedCount?: boolean;
  readonly pageSizeOptions?: readonly number[];
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50] as const;

/** The pagination bar under a `DataTable`: rows-per-page, the page count and the four navigation buttons. */
export function DataTablePagination<TData>({
  table,
  showSelectedCount = true,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: DataTablePaginationProps<TData>): ReactElement {
  const { t } = useTranslation();
  const items = pageSizeOptions.map((value) => ({
    value: String(value),
    label: String(value),
  }));
  const pageCount = Math.max(table.getPageCount(), 1);

  return (
    <div className='flex flex-wrap items-center justify-between gap-2'>
      {showSelectedCount ? (
        <p className='text-sm text-muted-foreground'>
          {t('dataTable.selectedCount', {
            selected: table.getFilteredSelectedRowModel().rows.length,
            total: table.getFilteredRowModel().rows.length,
          })}
        </p>
      ) : (
        <span />
      )}
      <div className='flex flex-wrap items-center gap-4'>
        <div className='flex items-center gap-2'>
          <p className='text-sm text-muted-foreground'>
            {t('dataTable.rowsPerPage')}
          </p>
          <Select
            items={items}
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(value: string | null) => {
              if (value) table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger size='sm' className='w-[70px]'>
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
        <div className='flex items-center gap-2'>
          <p className='text-sm text-muted-foreground'>
            {t('dataTable.pageOf', {
              page: table.getState().pagination.pageIndex + 1,
              pageCount,
            })}
          </p>
          <div className='flex items-center gap-1'>
            <Button
              type='button'
              variant='outline'
              size='icon-sm'
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              aria-label={t('dataTable.firstPage')}
            >
              <ChevronsLeftIcon />
            </Button>
            <Button
              type='button'
              variant='outline'
              size='icon-sm'
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label={t('dataTable.previousPage')}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              type='button'
              variant='outline'
              size='icon-sm'
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label={t('dataTable.nextPage')}
            >
              <ChevronRightIcon />
            </Button>
            <Button
              type='button'
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
    </div>
  );
}

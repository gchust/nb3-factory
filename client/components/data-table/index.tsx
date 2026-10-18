import {
  FlexRender,
  useTable,
  type OnChangeFn,
  type PaginationState,
  type RowData,
} from '@tanstack/react-table';
import { useTranslation } from '@nocobase/i18n/client';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '#components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { dataTableFeatures, type DataTableColumn } from './features.js';

export interface DataTableProps<TData extends RowData> {
  readonly columns: readonly DataTableColumn<TData>[];
  readonly data: readonly TData[];
  readonly pageIndex: number;
  readonly pageSize: number;
  readonly rowCount: number;
  readonly onPaginationChange: OnChangeFn<PaginationState>;
  readonly getRowId?: (row: TData) => string;
}

/**
 * The application's table: a semantic table rendered from column definitions, with the page controls the
 * ledger needs. It deliberately carries no sorting, selection or column visibility until a page asks for them.
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  pageIndex,
  pageSize,
  rowCount,
  onPaginationChange,
  getRowId,
}: DataTableProps<TData>): ReactElement {
  const { t } = useTranslation();
  const table = useTable({
    features: dataTableFeatures,
    columns: [...columns],
    data: [...data],
    state: { pagination: { pageIndex, pageSize } },
    onPaginationChange,
    manualPagination: true,
    rowCount,
    ...(getRowId ? { getRowId } : {}),
  });

  const pageCount = Math.max(1, table.getPageCount());

  return (
    <div className='overflow-hidden rounded-xl border border-border bg-card'>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={header.column.id === 'actions' ? 'text-right' : ''}
                >
                  {header.isPlaceholder ? null : <FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cell.column.id === 'actions' ? 'text-right' : ''}
                >
                  <FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className='flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3'>
        <p className='text-sm text-muted-foreground'>
          {t('dataTable.pageOf', {
            page: pageIndex + 1,
            pageCount,
            defaultValue: 'Page {{page}} of {{pageCount}}',
          })}
        </p>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label={t('dataTable.previousPage', {
              defaultValue: 'Go to previous page',
            })}
          >
            <ChevronLeftIcon data-icon='inline-start' />
            {t('dataTable.previousPage', {
              defaultValue: 'Go to previous page',
            })}
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label={t('dataTable.nextPage', {
              defaultValue: 'Go to next page',
            })}
          >
            {t('dataTable.nextPage', {
              defaultValue: 'Go to next page',
            })}
            <ChevronRightIcon data-icon='inline-end' />
          </Button>
        </div>
      </div>
    </div>
  );
}

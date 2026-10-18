import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type Table as TanstackTable,
} from '@tanstack/react-table';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, type ReactNode, useState } from 'react';
import { cn } from 'cn';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { DataTablePagination } from '#components/data-table-pagination';
export { DataTableColumnHeader } from '#components/data-table-column-header';
export { DataTablePagination } from '#components/data-table-pagination';

export interface DataTableProps<TData, TValue> {
  readonly columns: ColumnDef<TData, TValue>[];
  readonly data: TData[];
  /** A stable row id, for example `(row) => row.id`, so selection and pagination follow records. */
  readonly getRowId?: (row: TData) => string;
  /** Shown in place of the rows when there are none; defaults to "No results." */
  readonly emptyMessage?: ReactNode;
  readonly pageSize?: number;
  readonly pageSizeOptions?: readonly number[];
  /** `false` shows every row and renders no pagination bar. */
  readonly pagination?: boolean;
  /** Rendered above the table, with the table instance; for a "Toggle columns" menu. */
  readonly toolbar?: (table: TanstackTable<TData>) => ReactNode;
  /** Makes the whole row clickable; leave it out when a row holds links or menus. */
  readonly onRowClick?: (row: TData) => void;
  readonly className?: string;
  /** A table without row selection passes `false`, so the pagination bar does not say "0 of N row(s) selected". */
  readonly showSelectedCount?: boolean;
}

/**
 * The application's list table: sorting, browser-side pagination and the four
 * states a list has. Filtering and search belong to the endpoint, so the page
 * passes it the rows it already fetched.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  getRowId,
  emptyMessage,
  pageSize = 10,
  pageSizeOptions,
  pagination: paginationEnabled = true,
  toolbar,
  onRowClick,
  className,
  showSelectedCount = true,
}: DataTableProps<TData, TValue>): ReactElement {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  // React Compiler cannot memoize TanStack Table's API, which is why it skips this component; that is expected here,
  // since the table is rebuilt from `columns` and `data` on every render anyway.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: paginationEnabled
      ? getPaginationRowModel()
      : undefined,
    getSortedRowModel: getSortedRowModel(),
    getRowId,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: { pagination, rowSelection, sorting },
  });

  const rows = table.getRowModel().rows;

  return (
    <div className={cn('flex w-full flex-col gap-4', className)}>
      {toolbar ? toolbar(table) : null}
      <div className='overflow-hidden rounded-lg border'>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                  onClick={
                    onRowClick ? () => onRowClick(row.original) : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-32 text-center text-muted-foreground'
                >
                  {emptyMessage ?? t('dataTable.noResults')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {paginationEnabled ? (
        <DataTablePagination
          table={table}
          pageSizeOptions={pageSizeOptions}
          showSelectedCount={showSelectedCount}
        />
      ) : null}
    </div>
  );
}

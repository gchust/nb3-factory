import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type Table as TableInstance,
} from '@tanstack/react-table';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement, type ReactNode } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { cn } from 'cn';

import { DataTablePagination } from './pagination.js';

export interface DataTableProps<TData> {
  readonly columns: ColumnDef<TData>[];
  readonly data: readonly TData[];
  /** Returns a stable row id, for example `(row) => row.id`. */
  readonly getRowId?: (row: TData) => string;
  /** What the table shows when there are no rows; defaults to "No results.". */
  readonly emptyMessage?: ReactNode;
  /** Rows per page, default 10. */
  readonly pageSize?: number;
  readonly pageSizeOptions?: readonly number[];
  /** When `false`, all rows are shown and there is no pagination bar. */
  readonly pagination?: boolean;
  /** Rendered above the table, with access to the table instance (for `DataTableViewOptions`). */
  readonly toolbar?: (table: TableInstance<TData>) => ReactNode;
  /** Makes the whole row clickable. Do not use it when the row contains links, buttons or menus. */
  readonly onRowClick?: (row: TData) => void;
  readonly className?: string;
  /** Defaults to `true`; pass `false` on a table without row selection. */
  readonly showSelectedCount?: boolean;
  readonly initialSorting?: SortingState;
}

/** The application's list table, built on TanStack Table and the `table` primitive. */
export function DataTable<TData>({
  columns,
  data,
  getRowId,
  emptyMessage,
  pageSize = 10,
  pageSizeOptions,
  pagination = true,
  toolbar,
  onRowClick,
  className,
  showSelectedCount = true,
  initialSorting,
}: DataTableProps<TData>): ReactElement {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>(initialSorting ?? []);

  // TanStack Table returns functions the React Compiler cannot memoize; that is expected for this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    // TanStack Table types `data` as mutable while it only reads it.
    data: data as TData[],
    columns,
    getRowId,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    ...(pagination
      ? {
          getPaginationRowModel: getPaginationRowModel(),
        }
      : {}),
    getSortedRowModel: getSortedRowModel(),
    initialState: { pagination: { pageSize } },
  });

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {toolbar ? (
        <div className='flex items-center'>{toolbar(table)}</div>
      ) : null}
      <div className='overflow-hidden rounded-lg border border-border'>
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
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
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
                  className='h-24 text-center text-muted-foreground'
                >
                  {emptyMessage ?? t('dataTable.noResults')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {pagination ? (
        <DataTablePagination
          table={table}
          showSelectedCount={showSelectedCount}
          pageSizeOptions={pageSizeOptions}
        />
      ) : null}
    </div>
  );
}

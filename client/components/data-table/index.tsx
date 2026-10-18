import { useTranslation } from '@nocobase/i18n/client';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type Table as TanstackTable,
} from '@tanstack/react-table';
import { type ReactElement, type ReactNode, useState } from 'react';

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
  readonly data: TData[];
  /** A stable row id, so selection and expansion follow records rather than row positions. */
  readonly getRowId?: (row: TData) => string;
  /** What an empty table shows; defaults to "No results.". */
  readonly emptyMessage?: ReactNode;
  /** Rows per page, 10 by default. */
  readonly pageSize?: number;
  /** The selectable rows-per-page values. */
  readonly pageSizeOptions?: readonly number[];
  /** Pass `false` to show every row with no pagination bar. */
  readonly pagination?: boolean;
  /** Rendered above the table with access to the table instance, for browser-side filters and column toggling. */
  readonly toolbar?: (table: TanstackTable<TData>) => ReactNode;
  /** Makes the whole row clickable; do not use it when the row contains links, buttons or menus. */
  readonly onRowClick?: (row: TData) => void;
  readonly className?: string;
  /** Defaults to `true`; pass `false` on a table without row selection. */
  readonly showSelectedCount?: boolean;
  /** The order a header shows before the user sorts; the endpoint's order otherwise. */
  readonly initialSorting?: SortingState;
}

/**
 * A sortable, paginated table on TanStack Table. The application's own component: filtering and paging decisions stay
 * with the page, which passes the endpoint parameters and the row set it wants shown.
 */
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

  // TanStack Table is the application's table engine (see the table reference); the compiler cannot memoize its
  // instance, so the warning is expected and the table is used directly.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(pagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    ...(getRowId ? { getRowId: (row: TData) => getRowId(row) } : {}),
    onSortingChange: setSorting,
    state: { sorting },
    initialState: { pagination: { pageIndex: 0, pageSize } },
  });

  return (
    <div className={cn('space-y-4', className)}>
      {toolbar ? (
        <div className='flex flex-wrap items-center gap-2'>
          {toolbar(table)}
        </div>
      ) : null}
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
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
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
          pageSizeOptions={pageSizeOptions}
          showSelectedCount={showSelectedCount}
        />
      ) : null}
    </div>
  );
}

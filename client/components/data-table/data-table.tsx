import type {
  ColumnDef,
  ColumnFiltersState,
  RowSelectionState,
  SortingState,
  Table as TanStackTable,
  VisibilityState,
} from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement, ReactNode } from 'react';
import { useState } from 'react';

import { cn } from 'cn';

import { DataTablePagination } from '#components/data-table/pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

export interface DataTableProps<TData> {
  /** Column definitions, created with `useMemo`. */
  readonly columns: ColumnDef<TData, unknown>[];
  /** The rows of the current data set. */
  readonly data: TData[];
  /** A stable row id, for example `(row) => row.id`; keeps selection across reloads. */
  readonly getRowId?: (row: TData) => string;
  /** What the table shows when there are no rows (default: the translated "No results."). */
  readonly emptyMessage?: ReactNode;
  /** Rows per page, default 10. */
  readonly pageSize?: number;
  /** The selectable rows-per-page values, default `[10, 20, 30, 40, 50]`. */
  readonly pageSizeOptions?: number[];
  /** When `false`, all rows are shown and there is no pagination bar. */
  readonly pagination?: boolean;
  /** Rendered above the table inside the component, with access to the table instance. */
  readonly toolbar?: (table: TanStackTable<TData>) => ReactNode;
  /** Makes the whole row clickable. Do not use it when the row contains links, buttons or menus. */
  readonly onRowClick?: (row: TData) => void;
  /** Class name of the outer container. */
  readonly className?: string;
  /** Defaults to `true`; pass `false` on a table without row selection. */
  readonly showSelectedCount?: boolean;
  /** The sort the table starts with, so a header shows a direction before the user sorts. */
  readonly initialSorting?: SortingState;
}

/**
 * The application's list table, built on TanStack Table. It displays, sorts and
 * paginates in the browser; search and filters belong to the endpoint and the
 * page around it. See `references/table.md` in the development Skill.
 */
export function DataTable<TData>({
  columns,
  data,
  getRowId,
  emptyMessage,
  pageSize = DEFAULT_PAGE_SIZE,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  pagination = true,
  toolbar,
  onRowClick,
  className,
  showSelectedCount = true,
  initialSorting,
}: DataTableProps<TData>): ReactElement {
  const { t } = useTranslation();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>(initialSorting ?? []);

  // TanStack Table returns functions React Compiler cannot memoize safely, so it
  // skips this component by design. The warning is expected and suppressed here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility, rowSelection, columnFilters },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(pagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: { pagination: { pageSize } },
    ...(getRowId ? { getRowId } : {}),
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
          pageSizeOptions={pageSizeOptions}
          showSelectedCount={showSelectedCount}
        />
      ) : null}
    </div>
  );
}

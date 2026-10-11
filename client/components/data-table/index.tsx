import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
  type Table as TableInstance,
} from '@tanstack/react-table';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, type ReactNode, useState } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { DataTablePagination } from './pagination.js';

export interface DataTableProps<TData, TValue> {
  readonly columns: ColumnDef<TData, TValue>[];
  readonly data: readonly TData[];
  /** Returns a stable row id, so sorting and selection follow records rather than row positions. */
  readonly getRowId?: (row: TData, index: number) => string;
  /** Shown in place of the rows when there are none; defaults to the system "No results." copy. */
  readonly emptyMessage?: ReactNode;
  readonly pageSize?: number;
  readonly pageSizeOptions?: readonly number[];
  /** `false` shows every row and hides the pagination bar. */
  readonly pagination?: boolean;
  /** Rendered above the table, inside `DataTable`, with access to the table instance. */
  readonly toolbar?: (table: TableInstance<TData>) => ReactNode;
  /** Makes the whole row clickable; do not use it when the row contains links, buttons or menus. */
  readonly onRowClick?: (row: TData) => void;
  readonly className?: string;
  /** `false` on a table without row selection, so the pagination bar omits the selection summary. */
  readonly showSelectedCount?: boolean;
  /** The sort shown before the user sorts; the default order otherwise follows the endpoint. */
  readonly initialSorting?: SortingState;
}

/**
 * The application's list table, built on TanStack Table following shadcn's Data Table guide. It sorts and paginates
 * in the browser: filtering and the request belong to the endpoint, and this component only displays the rows it is
 * given. Larger, server-paginated lists build on its companions instead.
 */
export function DataTable<TData, TValue>({
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
}: DataTableProps<TData, TValue>): ReactElement {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>(initialSorting ?? []);
  const [paginationState, setPaginationState] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  // TanStack Table returns functions that cannot be memoized safely, so the React Compiler skips this component by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data: data as TData[],
    getRowId,
    // Without a pagination row model every row is rendered, which is what `pagination={false}` asks for.
    getPaginationRowModel: pagination ? getPaginationRowModel() : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onPaginationChange: setPaginationState,
    state: { sorting, pagination: paginationState },
  });

  const rows = table.getRowModel().rows;

  return (
    <div className={className}>
      {toolbar ? <div className='mb-2'>{toolbar(table)}</div> : null}
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
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-24 text-center text-muted-foreground'
                >
                  {emptyMessage ?? t('dataTable.noResults')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
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

import { useTranslation } from '@nocobase/i18n/client';
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
import { cn } from 'cn';
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

export interface DataTableProps<TData> {
  readonly columns: ColumnDef<TData>[];
  readonly data: TData[];
  /** A stable row id, such as `(row) => row.id`; keeps selection and expansion on the record across reloads. */
  readonly getRowId?: (row: TData) => string;
  /** What to show when there are no rows; default: the translated "No results". */
  readonly emptyMessage?: ReactNode;
  /** Rows per page, default 10. */
  readonly pageSize?: number;
  /** The selectable rows-per-page values, default `[10, 20, 30, 40, 50]`. */
  readonly pageSizeOptions?: readonly number[];
  /** `false` shows every row and renders no pagination bar. */
  readonly pagination?: boolean;
  /** Rendered above the table with the table instance, for a page's own toolbar controls. */
  readonly toolbar?: (table: TableInstance<TData>) => ReactNode;
  readonly className?: string;
  /** `false` on a table without row selection, so the pagination bar omits "0 of N row(s) selected". */
  readonly showSelectedCount?: boolean;
  /** The initial sort, when the page wants a header to show its direction before the user sorts. */
  readonly initialSorting?: SortingState;
}

/**
 * The application's table: a TanStack table rendered with the shadcn table primitives, with browser-side sorting and
 * pagination and an empty state. It displays the rows it is given; search and filtering belong to the endpoint and
 * the page ([table.md](table.md)).
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
  className,
  showSelectedCount,
  initialSorting,
}: DataTableProps<TData>): ReactElement {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>(initialSorting ?? []);
  const [paginationState, setPaginationState] = useState({
    pageIndex: 0,
    pageSize,
  });

  // TanStack Table returns functions React Compiler cannot memoize safely, so it deliberately skips this component;
  // the table instance is intentionally rebuilt on each render rather than held in a ref.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(pagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    onSortingChange: setSorting,
    onPaginationChange: setPaginationState,
    state: { sorting, pagination: paginationState },
  });

  const rows = table.getRowModel().rows;

  return (
    <div className={cn('space-y-4', className)}>
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
            {rows.length > 0 ? (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
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
                  colSpan={table.getAllColumns().length}
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

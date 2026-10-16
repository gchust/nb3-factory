import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type Row,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { type ReactElement, type ReactNode, useState } from 'react';
import { cn } from 'cn';

import { Button } from '#components/ui/button';
import { Empty, EmptyDescription, EmptyTitle } from '#components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { useTranslation } from '@nocobase/i18n/client';

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
/** Stable keys for the placeholder rows shown while loading; an array index would remount them on every render. */
const SKELETON_ROW_KEYS = [
  'skeleton-row-0',
  'skeleton-row-1',
  'skeleton-row-2',
  'skeleton-row-3',
  'skeleton-row-4',
];

export interface DataTableProps<TData> {
  readonly columns: ColumnDef<TData, unknown>[];
  readonly data: readonly TData[];
  readonly getRowId?: (row: TData) => string;
  readonly emptyTitle?: ReactNode;
  readonly emptyDescription?: ReactNode;
  readonly loading?: boolean;
  readonly initialPageSize?: number;
  readonly pageSizeOptions?: readonly number[];
  readonly showPagination?: boolean;
  readonly toolbar?: ReactNode;
  readonly onRowClick?: (row: TData) => void;
  readonly className?: string;
}

/** A sortable column header; render it as `header: () => <DataTableColumnHeader column={column} title={…} />`. */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  readonly column: Column<TData, TValue>;
  readonly title: ReactNode;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  if (!column.getCanSort()) {
    return <span className={className}>{title}</span>;
  }
  const sorted = column.getIsSorted();
  const Icon =
    sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <Button
      variant='ghost'
      size='sm'
      className={cn('-ml-2.5 h-8 data-[state=open]:bg-accent', className)}
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      {title}
      <Icon className='size-3.5 text-muted-foreground' />
      <span className='sr-only'>
        {sorted === 'asc'
          ? t('dataTable.sortDescending')
          : t('dataTable.sortAscending')}
      </span>
    </Button>
  );
}

/** The application's table: sorting, paging, an empty state and a toolbar slot. */
export function DataTable<TData>({
  columns,
  data,
  getRowId,
  emptyTitle,
  emptyDescription,
  loading = false,
  initialPageSize = 20,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  showPagination = true,
  toolbar,
  onRowClick,
  className,
}: DataTableProps<TData>): ReactElement {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>([]);

  // TanStack Table returns a mutable instance the React Compiler cannot memoize; the library is intentionally
  // used here for sorting and pagination.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data as TData[],
    columns,
    getRowId,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: initialPageSize } },
  });

  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;

  const openRow = (row: Row<TData>): void => {
    onRowClick?.(row.original);
  };

  return (
    <div className={cn('flex w-full flex-col gap-3', className)}>
      {toolbar ? (
        <div className='flex flex-wrap items-center justify-between gap-2'>
          {toolbar}
        </div>
      ) : null}
      <div className='overflow-hidden rounded-xl border border-border'>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() }}
                  >
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
            {loading ? (
              SKELETON_ROW_KEYS.map((rowKey) => (
                <TableRow key={rowKey}>
                  {table.getAllLeafColumns().map((column) => (
                    <TableCell key={`${rowKey}-${column.id}`}>
                      <Skeleton className='h-5 w-full' />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className='h-32'>
                  <Empty className='border-0'>
                    {emptyTitle ? <EmptyTitle>{emptyTitle}</EmptyTitle> : null}
                    {emptyDescription ? (
                      <EmptyDescription>{emptyDescription}</EmptyDescription>
                    ) : (
                      <EmptyDescription>
                        {t('dataTable.noResults')}
                      </EmptyDescription>
                    )}
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                  onClick={onRowClick ? () => openRow(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openRow(row);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
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
      {showPagination && !loading && rows.length > 0 ? (
        <div className='flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground'>
          <span>
            {t('dataTable.pageOf', {
              page: table.getState().pagination.pageIndex + 1,
              pageCount: Math.max(table.getPageCount(), 1),
            })}
          </span>
          <div className='flex items-center gap-2'>
            <span className='hidden sm:inline'>
              {t('dataTable.rowsPerPage')}
            </span>
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(value: string | null) => {
                if (value) table.setPageSize(Number(value));
              }}
            >
              <SelectTrigger size='sm' className='w-20'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant='outline'
              size='sm'
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              {t('dataTable.previousPage')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              {t('dataTable.nextPage')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

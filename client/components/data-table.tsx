import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { Input } from './ui/input.js';
import { Skeleton } from './ui/skeleton.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table.js';

export interface DataTableColumn<T> {
  /** Stable identity for the column, used as the React key. */
  readonly key: string;
  /** Message key of the column heading. */
  readonly headerKey: string;
  /** Cell content. Defaults to the column's searchable text. */
  readonly render?: (row: T) => ReactNode;
  /** Value the column contributes to the free-text filter. */
  readonly text?: (row: T) => string | null | undefined;
  readonly className?: string;
}

export interface DataTableProps<T> {
  readonly columns: readonly DataTableColumn<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string | number;
  readonly loading?: boolean;
  /** Extra text the filter matches that no column shows, such as a laboratory name. */
  readonly searchText?: (row: T) => string;
  readonly searchPlaceholderKey?: string;
  readonly onRowClick?: (row: T) => void;
  readonly toolbar?: ReactNode;
  readonly emptyKey?: string;
}

function textOf<T>(row: T, column: DataTableColumn<T>): string {
  const value = column.text?.(row);
  return value === null || value === undefined ? '' : value;
}

/**
 * A table with a free-text filter, an empty state and a loading state.
 *
 * Filtering is done in the browser over the rows the server already authorized and returned; the
 * server never receives a search term it would have to re-authorize.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  searchText,
  searchPlaceholderKey = 'lab.search',
  onRowClick,
  toolbar,
  emptyKey = 'lab.empty',
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [needle, setNeedle] = useState('');

  const filtered = useMemo(() => {
    const trimmed = needle.trim().toLowerCase();
    if (!trimmed) return rows;
    return rows.filter((row) => {
      const haystack = [
        ...columns.map((column) => textOf(row, column)),
        searchText?.(row) ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [columns, needle, rows, searchText]);

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Input
          value={needle}
          onChange={(event) => setNeedle(event.target.value)}
          placeholder={t(searchPlaceholderKey)}
          className='max-w-xs'
        />
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-muted-foreground text-sm'>
            {t('lab.rowCount', { count: filtered.length })}
          </span>
          {toolbar}
        </div>
      </div>
      <div className='border-border overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className={column.className}>
                  {t(column.headerKey)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <Skeleton className='h-6 w-full' />
                </TableCell>
              </TableRow>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='text-muted-foreground text-center'
                >
                  {rows.length === 0 ? t(emptyKey) : t('lab.noMatch')}
                </TableCell>
              </TableRow>
            ) : null}
            {!loading
              ? filtered.map((row) => (
                  <TableRow
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={onRowClick ? 'cursor-pointer' : undefined}
                  >
                    {columns.map((column) => (
                      <TableCell key={column.key} className={column.className}>
                        {column.render
                          ? column.render(row)
                          : textOf(row, column)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

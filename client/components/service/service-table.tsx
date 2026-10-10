import type { ReactElement, ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * A plain semantic table.
 *
 * The application does not ship a data-table component: a table here is a
 * `table` in the document with the theme's own surfaces, which keeps the
 * markup readable and every column an explicit decision. A page supplies its
 * columns and rows; the shell owns the border, the scrolling container and the
 * three non-content states so they look the same on every page.
 */
export interface ServiceTableColumn<T> {
  /** Unique, stable column id. */
  readonly key: string;
  readonly header: ReactNode;
  readonly cell: (row: T) => ReactNode;
  /** Extra classes for the column's cells, such as one that only shows on wide screens. */
  readonly className?: string;
  /** Set for the last column of an actions group so it aligns with the trailing edge. */
  readonly align?: 'start' | 'end';
}

export interface ServiceTableProps<T> {
  readonly columns: readonly ServiceTableColumn<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  /** An accessible caption, rendered for a screen reader only. */
  readonly caption: string;
  /** What to show inside the frame instead of rows when the list is empty. */
  readonly empty: ReactNode;
  readonly isPending?: boolean;
}

export function ServiceTable<T>({
  caption,
  columns,
  empty,
  isPending = false,
  rowKey,
  rows,
}: ServiceTableProps<T>): ReactElement {
  return (
    <div className='overflow-hidden rounded-lg border border-border bg-card'>
      <div className='overflow-x-auto'>
        <table className='w-full caption-bottom text-sm'>
          <caption className='sr-only'>{caption}</caption>
          <thead className='border-b border-border bg-muted/40'>
            <tr>
              {columns.map((column) => (
                <th
                  className={cn(
                    'px-4 py-3 text-start text-xs font-medium tracking-wide text-muted-foreground uppercase',
                    column.align === 'end' && 'text-end',
                    column.className,
                  )}
                  key={column.key}
                  scope='col'
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              <tr>
                <td className='px-4 py-6' colSpan={columns.length}>
                  <div className='space-y-2' role='status'>
                    {[0, 1, 2].map((index) => (
                      <Skeleton className='h-5 w-full' key={index} />
                    ))}
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  className='px-4 py-10 text-center text-muted-foreground'
                  colSpan={columns.length}
                >
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  className='border-b border-border/60 transition-colors last:border-b-0 hover:bg-muted/40'
                  key={rowKey(row)}
                >
                  {columns.map((column) => (
                    <td
                      className={cn(
                        'px-4 py-3 align-middle',
                        column.align === 'end' && 'text-end',
                        column.className,
                      )}
                      key={column.key}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

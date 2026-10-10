import type { ReactElement, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * A record's fields as a definition list.
 *
 * `dt`/`dd` pairs are what a screen reader announces as a term and its value, so
 * a detail panel uses a list rather than a grid of labelled `div`s. The value of
 * a field the record does not carry is an em dash, which is one character and
 * survives both locales.
 */
export interface DetailListProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

export function DetailList({
  children,
  className,
}: DetailListProps): ReactElement {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3 sm:grid-cols-2', className)}>
      {children}
    </dl>
  );
}

export interface DetailItemProps {
  readonly label: ReactNode;
  readonly children?: ReactNode;
  /** Spans both columns of the list, for a long free-text field. */
  readonly wide?: boolean;
  readonly className?: string;
}

export function DetailItem({
  children,
  className,
  label,
  wide = false,
}: DetailItemProps): ReactElement {
  const value =
    children === undefined || children === null || children === '' ? (
      <span className='text-muted-foreground'>—</span>
    ) : (
      children
    );
  return (
    <div
      className={cn('min-w-0 space-y-1', wide && 'sm:col-span-2', className)}
    >
      <dt className='text-xs font-medium text-muted-foreground'>{label}</dt>
      <dd className='text-sm break-words whitespace-pre-wrap'>{value}</dd>
    </div>
  );
}

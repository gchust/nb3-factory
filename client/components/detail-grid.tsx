import type { ReactNode } from 'react';

import { cn } from '../lib/utils.js';

export interface DetailItem {
  readonly label: string;
  readonly value: ReactNode;
}

/**
 * A record's fields, laid out as a description list.
 *
 * A detail page shows the same fields the form edits, read-only and in the same order; naming them
 * here keeps the two pages of a module from drifting apart.
 */
export function DetailGrid({
  items,
  className,
}: {
  readonly items: readonly DetailItem[];
  readonly className?: string;
}): ReactNode {
  return (
    <dl className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {items.map((item) => (
        <div key={item.label} className='min-w-0'>
          <dt className='text-muted-foreground text-xs'>{item.label}</dt>
          <dd className='mt-1 text-sm break-words'>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

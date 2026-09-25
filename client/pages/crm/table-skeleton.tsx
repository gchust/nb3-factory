import type { ReactElement } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * The first-load state of every CRM list: table-shaped rows behind
 * `role='status'`. Shared inside the feature because the three lists look the
 * same while loading, and the template ships no such component.
 */
export function CrmTableSkeleton({
  label,
}: {
  readonly label: string;
}): ReactElement {
  return (
    <div
      role='status'
      aria-label={label}
      className='space-y-4 rounded-lg border p-4'
    >
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className='flex items-center gap-4'>
          <Skeleton className='h-4 w-2/5' />
          <Skeleton className='h-4 w-1/5' />
          <Skeleton className='h-4 w-1/5' />
          <Skeleton className='h-4 w-1/5' />
        </div>
      ))}
    </div>
  );
}

import type { ReactElement } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

/** A placeholder shaped like table rows, shown only during a list's first load. */
export function TableSkeleton({
  label,
}: {
  readonly label: string;
}): ReactElement {
  return (
    <div
      role='status'
      aria-label={label}
      className='overflow-hidden rounded-lg border'
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className='flex items-center gap-4 border-b px-4 py-3 last:border-b-0'
        >
          <Skeleton className='h-4 w-40' />
          <Skeleton className='h-4 w-24' />
          <Skeleton className='ml-auto h-4 w-28' />
        </div>
      ))}
    </div>
  );
}

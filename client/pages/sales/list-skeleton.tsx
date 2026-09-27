import type { ReactElement } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

/** The shape of a table's first load: rows of skeletons that hold the list's height. */
export function ListSkeleton({
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
          <Skeleton className='ml-auto h-4 w-16' />
          <Skeleton className='h-4 w-16' />
          <Skeleton className='h-4 w-24' />
        </div>
      ))}
    </div>
  );
}

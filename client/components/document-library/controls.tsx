import type { ComponentProps, ReactElement } from 'react';

import { cn } from '@/lib/utils';

/**
 * A native select styled with the application's tokens. The document pages use it for the discipline, status and
 * filter pickers: a native control keeps the options in the accessibility tree, which the upload and filter flows
 * depend on.
 */
export function SelectInput({
  className,
  ...props
}: ComponentProps<'select'>): ReactElement {
  return (
    <select
      data-slot='select-input'
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
        className,
      )}
      {...props}
    />
  );
}

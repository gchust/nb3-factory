import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { statusTone } from '../lib/format.js';

/**
 * A single visual mapping for business state. Colour is an addition to the
 * text, never the only signal: the label is always rendered.
 */
export function StatusBadge({
  label,
  value,
  className,
}: {
  readonly label: string;
  readonly value: string | null | undefined;
  readonly className?: string;
}): ReactElement {
  return (
    <Badge
      className={cn('whitespace-nowrap', className)}
      variant={statusTone(value)}
    >
      {label}
    </Badge>
  );
}

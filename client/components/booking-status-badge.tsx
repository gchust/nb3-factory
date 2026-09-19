import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { cn } from '@/lib/utils';
import type { BookingStatus } from '@/lib/rentals';

const STATUS_CLASSES: Readonly<Record<BookingStatus, string>> = {
  pending: 'bg-muted text-muted-foreground',
  confirmed: 'bg-primary/10 text-primary',
  delivered: 'bg-accent text-accent-foreground',
  returned: 'bg-secondary text-secondary-foreground',
  settled: 'bg-primary text-primary-foreground',
  cancelled: 'bg-destructive/10 text-destructive',
};

export function BookingStatusBadge({
  status,
  className,
}: {
  readonly status: BookingStatus;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex h-5 w-fit shrink-0 items-center rounded-4xl px-2 text-xs font-medium whitespace-nowrap',
        STATUS_CLASSES[status],
        className,
      )}
    >
      {t(`rentals.status.${status}`, { defaultValue: status })}
    </span>
  );
}

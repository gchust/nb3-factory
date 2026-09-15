import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { cn } from '@/lib/utils';

const statusStyles: Readonly<Record<string, string>> = {
  new: 'bg-primary/10 text-primary',
  in_progress: 'bg-chart-3/15 text-foreground',
  pending_customer: 'bg-chart-4/20 text-foreground',
  closed: 'bg-muted text-muted-foreground',
};

const priorityStyles: Readonly<Record<string, string>> = {
  high: 'bg-destructive/10 text-destructive',
  medium: 'bg-chart-4/20 text-foreground',
  low: 'bg-muted text-muted-foreground',
};

export function StatusBadge({
  status,
  className,
}: {
  readonly status: string;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        statusStyles[status] ?? 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {t(`support.status.${status}`, { defaultValue: status })}
    </span>
  );
}

export function PriorityBadge({
  priority,
  className,
}: {
  readonly priority: string;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        priorityStyles[priority] ?? 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {t(`support.priority.${priority}`, { defaultValue: priority })}
    </span>
  );
}

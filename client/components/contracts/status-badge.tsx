import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import type { ContractStatus } from '@/lib/contracts';
import { Badge } from '@/components/ui/badge';

/** Semantic styling per status; every class is a theme token, not a raw color. */
const STATUS_CLASS: Readonly<Record<ContractStatus, string>> = {
  draft: 'bg-secondary text-secondary-foreground',
  active: 'bg-primary/10 text-primary',
  expired: 'bg-muted text-muted-foreground',
  terminated: 'bg-destructive/10 text-destructive',
};

export function StatusBadge({
  status,
}: {
  readonly status: ContractStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge
      variant='outline'
      className={`border-transparent ${STATUS_CLASS[status]}`}
    >
      {t(`contracts.statuses.${status}`)}
    </Badge>
  );
}

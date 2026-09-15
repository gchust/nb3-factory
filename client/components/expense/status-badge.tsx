import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import type { ClaimStatus } from '@/lib/expense-api';
import { CLAIM_STATUS_KEYS } from '@/lib/expense-display';

const VARIANTS: Readonly<
  Record<ClaimStatus, 'default' | 'secondary' | 'destructive' | 'outline'>
> = {
  draft: 'outline',
  pending: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  paid: 'default',
};

export function ExpenseStatusBadge({
  status,
}: {
  readonly status: ClaimStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={VARIANTS[status] ?? 'outline'}>
      {t(CLAIM_STATUS_KEYS[status] ?? 'expense.status.draft')}
    </Badge>
  );
}

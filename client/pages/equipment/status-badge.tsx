import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type { EquipmentStatus, LoanStatus } from './types.js';

const EQUIPMENT_STATUS_VARIANT: Record<
  EquipmentStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  available: 'outline',
  borrowed: 'secondary',
  overdue: 'destructive',
};

const LOAN_STATUS_VARIANT: Record<
  LoanStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  borrowed: 'secondary',
  returned: 'outline',
  overdue: 'destructive',
};

/** The equipment's derived status: available, borrowed or overdue. */
export function EquipmentStatusBadge({
  status,
}: {
  readonly status: EquipmentStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={EQUIPMENT_STATUS_VARIANT[status]}>
      {t(`equipment.status.${status}`)}
    </Badge>
  );
}

/** The borrow record's status, so a status looks the same on both pages. */
export function LoanStatusBadge({
  status,
}: {
  readonly status: LoanStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={LOAN_STATUS_VARIANT[status]}>
      {t(`borrowRecords.status.${status}`)}
    </Badge>
  );
}

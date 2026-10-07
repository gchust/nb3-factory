import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type { ClaimStatus, ExportJobStatus } from './types.js';

const STATUS_VARIANT: Record<
  ClaimStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'outline',
  pending_supervisor: 'secondary',
  pending_finance: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  paid: 'default',
};

export function ClaimStatusBadge({
  status,
}: {
  readonly status: ClaimStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANT[status]}>
      {t(`expense.status.${status}`)}
    </Badge>
  );
}

const EXPORT_VARIANT: Record<
  ExportJobStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'outline',
  running: 'secondary',
  completed: 'default',
  failed: 'destructive',
};

export function ExportStatusBadge({
  status,
}: {
  readonly status: ExportJobStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={EXPORT_VARIANT[status]}>
      {t(`expense.export.status.${status}`)}
    </Badge>
  );
}

import { useTranslation } from '@nocobase/i18n/client';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';

import { stageLabelKey, statusLabelKey } from '../../lib/sales-constants.js';

const STAGE_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  new: 'secondary',
  'needs-confirmation': 'secondary',
  'proposal-quote': 'default',
  negotiation: 'default',
  won: 'default',
  lost: 'destructive',
};

const STATUS_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  active: 'default',
  potential: 'secondary',
  inactive: 'outline',
  new: 'secondary',
  assigned: 'default',
  converted: 'default',
  closed: 'outline',
  pending: 'secondary',
  approved: 'default',
  rejected: 'destructive',
};

export function StageBadge({ stage }: { stage: string }): ReactNode {
  const { t } = useTranslation();
  return (
    <Badge variant={STAGE_VARIANTS[stage] ?? 'secondary'}>
      {t(stageLabelKey(stage), { defaultValue: stage })}
    </Badge>
  );
}

export function StatusBadge({
  prefix,
  status,
}: {
  prefix: string;
  status: string;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? 'secondary'}>
      {t(statusLabelKey(prefix, status), { defaultValue: status })}
    </Badge>
  );
}

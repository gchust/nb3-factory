import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { Badge } from '@/components/ui/badge';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const STAGE_VARIANTS: Readonly<Record<string, BadgeVariant>> = {
  lead: 'outline',
  following: 'secondary',
  quoted: 'default',
  won: 'default',
  lost: 'destructive',
};

const STATUS_VARIANTS: Readonly<Record<string, BadgeVariant>> = {
  potential: 'outline',
  active: 'default',
  lost: 'destructive',
};

export function StageBadge({ stage }: { stage: string }): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STAGE_VARIANTS[stage] ?? 'outline'}>
      {t(`crm.stage.${stage}`, { defaultValue: stage })}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: string }): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? 'outline'}>
      {t(`crm.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

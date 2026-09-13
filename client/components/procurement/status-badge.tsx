import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const VARIANTS: Readonly<Record<string, BadgeVariant>> = {
  active: 'default',
  approved: 'default',
  received: 'default',
  disabled: 'destructive',
  rejected: 'destructive',
  pending: 'outline',
  partial: 'outline',
  draft: 'secondary',
  ordered: 'secondary',
};

export function StatusBadge({
  kind,
  status,
}: {
  readonly kind: 'supplier' | 'request' | 'order';
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={VARIANTS[status] ?? 'secondary'}>
      {t(`procurement.${kind}Status.${status}`)}
    </Badge>
  );
}

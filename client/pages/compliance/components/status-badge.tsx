import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '../labels.js';

export interface StatusBadgeProps {
  readonly tone: BadgeTone;
  readonly labelKey: string;
  readonly fallback?: string;
}

export function StatusBadge({
  tone,
  labelKey,
  fallback,
}: StatusBadgeProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={tone}>
      {t(labelKey, { defaultValue: fallback ?? labelKey })}
    </Badge>
  );
}

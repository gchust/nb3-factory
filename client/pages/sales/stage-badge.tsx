import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import { STAGE_BADGE_VARIANTS, STAGE_LABEL_KEYS } from './stage.js';
import type { OpportunityStage } from './types.js';

/** One stage badge, shared by the opportunity list and the customer detail. */
export function OpportunityStageBadge({
  stage,
}: {
  readonly stage: OpportunityStage;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STAGE_BADGE_VARIANTS[stage]}>
      {t(STAGE_LABEL_KEYS[stage])}
    </Badge>
  );
}

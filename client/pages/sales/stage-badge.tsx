import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type { OpportunityStage } from './types.js';

const STAGE_VARIANT: Record<
  OpportunityStage,
  'default' | 'secondary' | 'outline'
> = {
  following: 'secondary',
  won: 'default',
  lost: 'outline',
};

/** Shared by the opportunity list and the customer detail, so a stage looks the same everywhere. */
export function StageBadge({
  stage,
}: {
  readonly stage: OpportunityStage;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STAGE_VARIANT[stage]}>
      {t(`sales.opportunities.stage.${stage}`)}
    </Badge>
  );
}

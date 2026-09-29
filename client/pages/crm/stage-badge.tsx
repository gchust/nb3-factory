import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type { OpportunityStage } from './types.js';

const STAGE_BADGE: Record<
  OpportunityStage,
  'secondary' | 'default' | 'destructive'
> = {
  following: 'secondary',
  won: 'default',
  lost: 'destructive',
};

export function OpportunityStageBadge({
  stage,
}: {
  readonly stage: OpportunityStage;
}): ReactElement {
  const { t } = useTranslation();
  return <Badge variant={STAGE_BADGE[stage]}>{t(`crm.stage.${stage}`)}</Badge>;
}

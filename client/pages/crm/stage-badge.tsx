import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type { OpportunityStage } from './types.js';

const STAGE_VARIANT: Record<
  OpportunityStage,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  following: 'secondary',
  won: 'default',
  lost: 'destructive',
};

/** Status is shown as text in a Badge, never by color alone (guideline T1.4). */
export function StageBadge({
  stage,
}: {
  readonly stage: OpportunityStage;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STAGE_VARIANT[stage]}>{t(`crm.stage.${stage}`)}</Badge>
  );
}

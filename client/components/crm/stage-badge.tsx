import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type { OpportunityStage } from './types.js';

const STAGE_VARIANT: Record<
  OpportunityStage,
  'outline' | 'default' | 'secondary' | 'destructive'
> = {
  following: 'secondary',
  won: 'default',
  lost: 'destructive',
};

/** Shows an opportunity's stage the same way everywhere it appears. */
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

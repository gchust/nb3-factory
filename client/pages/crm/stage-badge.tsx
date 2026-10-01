import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type { OpportunityStage } from './types.js';

const STAGE_VARIANT: Record<
  OpportunityStage,
  'default' | 'secondary' | 'outline'
> = {
  follow_up: 'secondary',
  won: 'default',
  lost: 'outline',
};

/** The localized stage label every CRM screen shows instead of the stored code. */
export function OpportunityStageBadge({
  stage,
}: {
  readonly stage: OpportunityStage;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STAGE_VARIANT[stage]}>{t(`crm.stage.${stage}`)}</Badge>
  );
}

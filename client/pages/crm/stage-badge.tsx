import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type { OpportunityStage } from './types.js';

/**
 * The variant a stage is shown with, so the same stage looks the same in the list and in a customer's detail.
 */
const variantByStage: Record<
  OpportunityStage,
  'default' | 'secondary' | 'outline'
> = {
  following: 'secondary',
  won: 'default',
  lost: 'outline',
};

/** An opportunity's stage as a translated badge. */
export function OpportunityStageBadge({
  stage,
}: {
  readonly stage: OpportunityStage;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={variantByStage[stage]}>
      {t(`opportunities.stage.${stage}`)}
    </Badge>
  );
}

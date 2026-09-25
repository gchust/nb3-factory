import type { VariantProps } from 'class-variance-authority';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge, type badgeVariants } from '@/components/ui/badge';

import type { OpportunityStage } from './types.js';

const STAGE_VARIANTS: Record<
  OpportunityStage,
  VariantProps<typeof badgeVariants>['variant']
> = {
  following: 'outline',
  won: 'default',
  lost: 'secondary',
};

/** One stage looks the same in the opportunity list and the customer detail. */
export function OpportunityStageBadge({
  stage,
}: {
  readonly stage: OpportunityStage;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STAGE_VARIANTS[stage]}>{t(`crm.stages.${stage}`)}</Badge>
  );
}

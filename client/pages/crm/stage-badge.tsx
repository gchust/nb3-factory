import { useTranslation } from '@nocobase/i18n/client';
import type { ComponentProps, ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type { OpportunityStage } from './types.js';

type BadgeVariant = ComponentProps<typeof Badge>['variant'];

const STAGE_VARIANTS = {
  following: 'secondary',
  won: 'default',
  lost: 'outline',
} as const satisfies Record<OpportunityStage, BadgeVariant>;

/**
 * Shows an opportunity's stage the same way on every surface: the list, the
 * customer detail view and the edit form all read the shared `crm.stages.*`
 * wording, so a stage looks identical wherever it appears.
 */
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

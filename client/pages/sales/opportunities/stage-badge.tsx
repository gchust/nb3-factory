import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type { OpportunityStage } from '../types.js';

/** The badge variant each stage uses: in progress is neutral, won is filled, lost is outlined. */
const VARIANTS = {
  following: 'secondary',
  won: 'default',
  lost: 'outline',
} as const satisfies Record<OpportunityStage, string>;

/** An opportunity's stage as a badge whose label follows the current language. */
export function OpportunityStageBadge({
  stage,
}: {
  readonly stage: OpportunityStage;
}): ReactElement {
  const { t } = useTranslation();
  return <Badge variant={VARIANTS[stage]}>{t(`sales.stage.${stage}`)}</Badge>;
}

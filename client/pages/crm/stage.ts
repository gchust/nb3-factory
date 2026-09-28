import type { VariantProps } from 'class-variance-authority';

import { badgeVariants } from '@/components/ui/badge';

import type { OpportunityStage } from './types.js';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

/** The badge each stage wears, consistent across the opportunity list and the customer detail panel. */
export const STAGE_BADGE: Record<OpportunityStage, BadgeVariant> = {
  following: 'secondary',
  won: 'default',
  lost: 'outline',
};

export const STAGE_ORDER: readonly OpportunityStage[] = [
  'following',
  'won',
  'lost',
];

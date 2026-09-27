import type { OpportunityStage } from './types.js';

/**
 * The three stable stage codes map to their translated labels and to one badge
 * variant, so a given stage looks the same on every screen.
 */
export const STAGE_LABEL_KEYS: Record<OpportunityStage, string> = {
  'in-progress': 'sales.stage.inProgress',
  won: 'sales.stage.won',
  lost: 'sales.stage.lost',
};

export const STAGE_BADGE_VARIANTS: Record<
  OpportunityStage,
  'secondary' | 'default' | 'destructive'
> = {
  'in-progress': 'secondary',
  won: 'default',
  lost: 'destructive',
};

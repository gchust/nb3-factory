import type { OpportunityStage } from './types.js';

/** The badge variant each stage uses, so the whole application shows one colour per stage. */
export const STAGE_BADGE_VARIANT: Record<
  OpportunityStage,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  following: 'secondary',
  won: 'default',
  lost: 'destructive',
};

/** The translation key of a stage's label. */
export function stageLabelKey(stage: OpportunityStage): string {
  return `sales.stage.${stage}`;
}

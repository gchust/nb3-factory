import { OPPORTUNITY_STAGES, type OpportunityStage } from './types.js';

/** Formats an expected amount for display, following the current UI language. */
export function formatAmount(value: number, language: string): string {
  return new Intl.NumberFormat(language, {
    style: 'currency',
    currency: 'CNY',
  }).format(value);
}

/** The translation key for an opportunity stage, under the CRM feature group. */
export function stageKey(stage: OpportunityStage): string {
  return `crm.stage.${stage}`;
}

/** Whether a value is one of the known stages, for narrowing a URL parameter. */
export function isOpportunityStage(value: unknown): value is OpportunityStage {
  return (
    typeof value === 'string' &&
    (OPPORTUNITY_STAGES as readonly string[]).includes(value)
  );
}

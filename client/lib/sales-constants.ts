/**
 * Business constants shared by the sales pages. Labels are translation keys
 * resolved through the application namespace at render time.
 */

export const OPPORTUNITY_STAGES = [
  'new',
  'needs-confirmation',
  'proposal-quote',
  'negotiation',
  'won',
  'lost',
] as const;

export const STAGE_ORDER: Record<string, number> = {
  new: 0,
  'needs-confirmation': 1,
  'proposal-quote': 2,
  negotiation: 3,
  won: 4,
  lost: 5,
};

export const ACTIVE_STAGES = [
  'new',
  'needs-confirmation',
  'proposal-quote',
  'negotiation',
] as const;

export const STAGE_WIN_PROBABILITY: Record<string, number> = {
  new: 10,
  'needs-confirmation': 30,
  'proposal-quote': 60,
  negotiation: 80,
  won: 100,
  lost: 0,
};

export const LEAD_STATUSES = [
  'new',
  'assigned',
  'converted',
  'closed',
] as const;

export const CUSTOMER_STATUSES = ['active', 'potential', 'inactive'] as const;

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;

export const FOLLOW_UP_METHODS = [
  'phone',
  'email',
  'visit',
  'meeting',
  'other',
] as const;

export const CUSTOMER_SIZES = ['small', 'medium', 'large'] as const;

export const LEAD_SOURCES = [
  'website',
  'referral',
  'exhibition',
  'cold-call',
  'other',
] as const;

export const ROLES = ['sales', 'sales-manager', 'visitor'] as const;

/** Translation key prefix for a stage label. */
export function stageLabelKey(stage: string): string {
  return `sales.stages.${stage}`;
}

/** Translation key prefix for a status label. */
export function statusLabelKey(prefix: string, status: string): string {
  return `sales.${prefix}.${status}`;
}

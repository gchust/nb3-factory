/**
 * Shared domain constants and types for the sales application.
 */

export const OPPORTUNITY_STAGES = {
  NEW: 'new',
  NEEDS_CONFIRMATION: 'needs-confirmation',
  PROPOSAL_QUOTE: 'proposal-quote',
  NEGOTIATION: 'negotiation',
  WON: 'won',
  LOST: 'lost',
} as const;

export type OpportunityStage =
  (typeof OPPORTUNITY_STAGES)[keyof typeof OPPORTUNITY_STAGES];

/** Linear forward progression; won/lost are terminal outcomes. */
export const STAGE_ORDER: readonly OpportunityStage[] = [
  OPPORTUNITY_STAGES.NEW,
  OPPORTUNITY_STAGES.NEEDS_CONFIRMATION,
  OPPORTUNITY_STAGES.PROPOSAL_QUOTE,
  OPPORTUNITY_STAGES.NEGOTIATION,
  OPPORTUNITY_STAGES.WON,
  OPPORTUNITY_STAGES.LOST,
];

export const ACTIVE_STAGES: readonly OpportunityStage[] = [
  OPPORTUNITY_STAGES.NEW,
  OPPORTUNITY_STAGES.NEEDS_CONFIRMATION,
  OPPORTUNITY_STAGES.PROPOSAL_QUOTE,
  OPPORTUNITY_STAGES.NEGOTIATION,
];

/** Win probability (%) per stage: 新建10 需求确认30 方案报价60 商务谈判80 赢单100 输单0. */
export const STAGE_WIN_PROBABILITY: Readonly<Record<OpportunityStage, number>> =
  {
    new: 10,
    'needs-confirmation': 30,
    'proposal-quote': 60,
    negotiation: 80,
    won: 100,
    lost: 0,
  };

export const LEAD_STATUSES = {
  NEW: 'new',
  ASSIGNED: 'assigned',
  CONVERTED: 'converted',
  CLOSED: 'closed',
} as const;

export type LeadStatus = (typeof LEAD_STATUSES)[keyof typeof LEAD_STATUSES];

export const CUSTOMER_STATUSES = {
  ACTIVE: 'active',
  POTENTIAL: 'potential',
  INACTIVE: 'inactive',
} as const;

export type CustomerStatus =
  (typeof CUSTOMER_STATUSES)[keyof typeof CUSTOMER_STATUSES];

export const APPROVAL_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type ApprovalStatus =
  (typeof APPROVAL_STATUSES)[keyof typeof APPROVAL_STATUSES];

export const FOLLOW_UP_METHODS = {
  PHONE: 'phone',
  EMAIL: 'email',
  VISIT: 'visit',
  MEETING: 'meeting',
  OTHER: 'other',
} as const;

export type FollowUpMethod =
  (typeof FOLLOW_UP_METHODS)[keyof typeof FOLLOW_UP_METHODS];

export const ROLES = {
  SALES: 'sales',
  SALES_MANAGER: 'sales-manager',
  VISITOR: 'visitor',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

/** Business error thrown by the sales service; routes map it to an HTTP response. */
export class SalesBusinessError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'SalesBusinessError';
    this.code = code;
    this.status = status;
  }
}

export function nextStage(stage: OpportunityStage): OpportunityStage | null {
  const index = STAGE_ORDER.indexOf(stage);
  if (index < 0 || index >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[index + 1];
}

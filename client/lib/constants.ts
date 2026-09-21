/**
 * Values shared across the client that must keep one identity for the whole life of the application.
 */

export const EMPTY_ARRAY: readonly never[] = Object.freeze([]);

export const CONTRACT_STATUSES = [
  'draft',
  'active',
  'performing',
  'completed',
  'terminated',
] as const;

export const MILESTONE_STATUSES = [
  'pending',
  'in_progress',
  'delivered',
  'accepted',
] as const;

export const VERSION_STATUSES = [
  'pending_review',
  'approved',
  'returned',
  'withdrawn',
] as const;

export const RECEIVABLE_STATUSES = ['unpaid', 'partial', 'paid'] as const;

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;

export const ISSUE_STATUSES = [
  'open',
  'in_progress',
  'resolved',
  'closed',
] as const;

export const ISSUE_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

// Application roles, stored per user in `deliveryRoleAssignments` and per
// project in `deliveryProjectMembers`.
export const MEMBER_ROLES = [
  'lead',
  'manager',
  'acceptor',
  'finance',
  'member',
] as const;

export const CONTRACT_TRANSITIONS: Readonly<Record<string, readonly string[]>> =
  {
    draft: ['active', 'terminated'],
    active: ['performing', 'terminated'],
    performing: ['completed', 'terminated'],
    completed: [],
    terminated: [],
  };

export const PAYMENT_METHODS = [
  'transfer',
  'acceptance',
  'cash',
  'other',
] as const;

export const FILE_RESOURCE_BY_KIND = {
  contract: 'deliveryProjectFiles',
  deliverable: 'deliveryTaskFiles',
  payment: 'deliverySettlementFiles',
} as const;

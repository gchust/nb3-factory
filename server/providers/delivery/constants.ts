/** Business roles a person can hold. A user may hold more than one. */
export const ROLES = [
  'lead',
  'manager',
  'acceptor',
  'finance',
  'member',
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return (
    typeof value === 'string' && (ROLES as readonly string[]).includes(value)
  );
}

/** Contract lifecycle: draft -> active -> performing -> completed | terminated. */
export const CONTRACT_STATUSES = [
  'draft',
  'active',
  'performing',
  'completed',
  'terminated',
] as const;

export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_TRANSITIONS: Readonly<
  Record<ContractStatus, readonly ContractStatus[]>
> = {
  draft: ['active', 'terminated'],
  active: ['performing', 'terminated'],
  performing: ['completed', 'terminated'],
  completed: [],
  terminated: [],
};

/** Milestone lifecycle. */
export const MILESTONE_STATUSES = [
  'pending',
  'in_progress',
  'delivered',
  'accepted',
] as const;

export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

/** Deliverable and version lifecycle: submitted -> pending review -> approved | returned. */
export const VERSION_STATUSES = [
  'pending_review',
  'approved',
  'returned',
  'withdrawn',
] as const;

export type VersionStatus = (typeof VERSION_STATUSES)[number];

/** Delivery task maintenance lifecycle. */
export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Issue list values. */
export const ISSUE_STATUSES = [
  'open',
  'in_progress',
  'resolved',
  'closed',
] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const RECEIVABLE_STATUSES = ['unpaid', 'partial', 'paid'] as const;

export const PAYMENT_METHODS = [
  'transfer',
  'acceptance',
  'cash',
  'other',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** File exposures, keyed by the business record they belong to. */
export const FILE_KINDS = ['contract', 'deliverable', 'payment'] as const;

export type FileKind = (typeof FILE_KINDS)[number];

export interface FileExposure {
  readonly kind: FileKind;
  /** Client resource name passed to the File Repository manager. */
  readonly resource: string;
  readonly collection: string;
  readonly accessPath: string;
  readonly targetType: 'contract' | 'version' | 'payment';
}

export const FILE_EXPOSURES: readonly FileExposure[] = [
  {
    kind: 'contract',
    resource: 'deliveryProjectFiles',
    collection: 'deliveryProjectFiles',
    accessPath: '/uploads/delivery-project-files',
    targetType: 'contract',
  },
  {
    kind: 'deliverable',
    resource: 'deliveryTaskFiles',
    collection: 'deliveryTaskFiles',
    accessPath: '/uploads/delivery-task-files',
    targetType: 'version',
  },
  {
    kind: 'payment',
    resource: 'deliverySettlementFiles',
    collection: 'deliverySettlementFiles',
    accessPath: '/uploads/delivery-settlement-files',
    targetType: 'payment',
  },
];

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 5;

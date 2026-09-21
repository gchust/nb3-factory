import {
  CONTRACT_STATUSES,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  MEMBER_ROLES,
  MILESTONE_STATUSES,
  PAYMENT_METHODS,
  RECEIVABLE_STATUSES,
  TASK_STATUSES,
  VERSION_STATUSES,
} from '@/lib/constants';

export type Translate = (
  key: string,
  options?: { defaultValue?: string },
) => string;

/** Explicit keys keep translation lookups type-checked instead of built at run time. */
export function contractStatusLabel(t: Translate, status: string): string {
  switch (status) {
    case 'draft':
      return t('delivery.status.contract.draft');
    case 'active':
      return t('delivery.status.contract.active');
    case 'performing':
      return t('delivery.status.contract.performing');
    case 'completed':
      return t('delivery.status.contract.completed');
    case 'terminated':
      return t('delivery.status.contract.terminated');
    default:
      return status;
  }
}

export function milestoneStatusLabel(t: Translate, status: string): string {
  switch (status) {
    case 'pending':
      return t('delivery.status.milestone.pending');
    case 'in_progress':
      return t('delivery.status.milestone.in_progress');
    case 'delivered':
      return t('delivery.status.milestone.delivered');
    case 'accepted':
      return t('delivery.status.milestone.accepted');
    default:
      return status;
  }
}

export function versionStatusLabel(t: Translate, status: string): string {
  switch (status) {
    case 'pending_review':
      return t('delivery.status.version.pending_review');
    case 'approved':
      return t('delivery.status.version.approved');
    case 'returned':
      return t('delivery.status.version.returned');
    case 'withdrawn':
      return t('delivery.status.version.withdrawn');
    default:
      return status;
  }
}

export function taskStatusLabel(t: Translate, status: string): string {
  switch (status) {
    case 'todo':
      return t('delivery.status.task.todo');
    case 'in_progress':
      return t('delivery.status.task.in_progress');
    case 'done':
      return t('delivery.status.task.done');
    default:
      return status;
  }
}

export function issueStatusLabel(t: Translate, status: string): string {
  switch (status) {
    case 'open':
      return t('delivery.status.issue.open');
    case 'in_progress':
      return t('delivery.status.issue.in_progress');
    case 'resolved':
      return t('delivery.status.issue.resolved');
    case 'closed':
      return t('delivery.status.issue.closed');
    default:
      return status;
  }
}

export function memberRoleLabel(t: Translate, role: string): string {
  switch (role) {
    case 'lead':
      return t('delivery.roles.lead');
    case 'manager':
      return t('delivery.roles.manager');
    case 'acceptor':
      return t('delivery.roles.acceptor');
    case 'finance':
      return t('delivery.roles.finance');
    case 'member':
      return t('delivery.roles.member');
    default:
      return role;
  }
}

export function memberRoleOptions(
  t: Translate,
): readonly { value: string; label: string }[] {
  return MEMBER_ROLES.map((role) => ({
    value: role,
    label: memberRoleLabel(t, role),
  }));
}

export function issueSeverityLabel(t: Translate, severity: string): string {
  switch (severity) {
    case 'low':
      return t('delivery.severity.low');
    case 'medium':
      return t('delivery.severity.medium');
    case 'high':
      return t('delivery.severity.high');
    case 'critical':
      return t('delivery.severity.critical');
    default:
      return severity;
  }
}

export function receivableStatusLabel(t: Translate, status: string): string {
  switch (status) {
    case 'unpaid':
      return t('delivery.status.receivable.unpaid');
    case 'partial':
      return t('delivery.status.receivable.partial');
    case 'paid':
      return t('delivery.status.receivable.paid');
    default:
      return status;
  }
}

export function paymentMethodLabel(t: Translate, method: string): string {
  switch (method) {
    case 'transfer':
      return t('delivery.paymentMethod.transfer');
    case 'acceptance':
      return t('delivery.paymentMethod.acceptance');
    case 'cash':
      return t('delivery.paymentMethod.cash');
    default:
      return t('delivery.paymentMethod.other');
  }
}

export type StatusKind =
  'contract' | 'milestone' | 'version' | 'receivable' | 'task' | 'issue';

export function statusLabel(
  t: Translate,
  kind: StatusKind,
  status: string,
): string {
  if (kind === 'contract') return contractStatusLabel(t, status);
  if (kind === 'milestone') return milestoneStatusLabel(t, status);
  if (kind === 'version') return versionStatusLabel(t, status);
  if (kind === 'task') return taskStatusLabel(t, status);
  if (kind === 'issue') return issueStatusLabel(t, status);
  return receivableStatusLabel(t, status);
}

export function contractStatusOptions(
  t: Translate,
): readonly { value: string; label: string }[] {
  return CONTRACT_STATUSES.map((status) => ({
    value: status,
    label: contractStatusLabel(t, status),
  }));
}

export function receivableStatusOptions(
  t: Translate,
): readonly { value: string; label: string }[] {
  return RECEIVABLE_STATUSES.map((status) => ({
    value: status,
    label: receivableStatusLabel(t, status),
  }));
}

export function versionStatusOptions(
  t: Translate,
): readonly { value: string; label: string }[] {
  return VERSION_STATUSES.map((status) => ({
    value: status,
    label: versionStatusLabel(t, status),
  }));
}

export function milestoneStatusOptions(
  t: Translate,
): readonly { value: string; label: string }[] {
  return MILESTONE_STATUSES.map((status) => ({
    value: status,
    label: milestoneStatusLabel(t, status),
  }));
}

export function taskStatusOptions(
  t: Translate,
): readonly { value: string; label: string }[] {
  return TASK_STATUSES.map((status) => ({
    value: status,
    label: taskStatusLabel(t, status),
  }));
}

export function issueStatusOptions(
  t: Translate,
): readonly { value: string; label: string }[] {
  return ISSUE_STATUSES.map((status) => ({
    value: status,
    label: issueStatusLabel(t, status),
  }));
}

export function issueSeverityOptions(
  t: Translate,
): readonly { value: string; label: string }[] {
  return ISSUE_SEVERITIES.map((severity) => ({
    value: severity,
    label: issueSeverityLabel(t, severity),
  }));
}

export function paymentMethodOptions(
  t: Translate,
): readonly { value: string; label: string }[] {
  return PAYMENT_METHODS.map((method) => ({
    value: method,
    label: paymentMethodLabel(t, method),
  }));
}

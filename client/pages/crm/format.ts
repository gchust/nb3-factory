/** Display helpers the CRM pages share: label keys and value formatting. */

export const STAGE_LABEL_KEYS: Record<string, string> = {
  initial_contact: 'crm.stage.initialContact',
  quote: 'crm.stage.quote',
  won: 'crm.stage.won',
  lost: 'crm.stage.lost',
};

export const METHOD_LABEL_KEYS: Record<string, string> = {
  call: 'crm.method.call',
  visit: 'crm.method.visit',
  email: 'crm.method.email',
  wechat: 'crm.method.wechat',
  other: 'crm.method.other',
};

export const FOLLOW_UP_STATUS_LABEL_KEYS: Record<string, string> = {
  pending: 'crm.followUpStatus.pending',
  done: 'crm.followUpStatus.done',
  cancelled: 'crm.followUpStatus.cancelled',
};

export const SUGGESTION_STATUS_LABEL_KEYS: Record<string, string> = {
  pending: 'crm.suggestionStatus.pending',
  approved: 'crm.suggestionStatus.approved',
  dismissed: 'crm.suggestionStatus.dismissed',
};

export const SUGGESTION_KIND_LABEL_KEYS: Record<string, string> = {
  overdue_followup: 'crm.suggestionKind.overdueFollowup',
  stalled_opportunity: 'crm.suggestionKind.stalledOpportunity',
  high_value_opportunity: 'crm.suggestionKind.highValueOpportunity',
  idle_customer: 'crm.suggestionKind.idleCustomer',
};

export const LEVEL_LABEL_KEYS: Record<string, string> = {
  A: 'crm.level.a',
  B: 'crm.level.b',
  C: 'crm.level.c',
};

const amountFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

/** A deal amount, grouped and without a currency symbol. */
export function formatAmount(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return amountFormatter.format(amount);
}

/** A date, without the time. Falls back to an em dash for an empty value. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

/** A date and time. Falls back to an em dash for an empty value. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

/** The value an `<input type='date'>` needs, from an ISO date-time. */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The value a `<input type='datetime-local'>` needs, from an ISO date-time. */
export function toDateTimeInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${toDateInputValue(value)}T${hours}:${minutes}`;
}

/** True when a pending follow-up is already due. */
export function isOverdue(
  status: string,
  dueAt: string | null | undefined,
): boolean {
  if (status !== 'pending' || !dueAt) return false;
  const due = new Date(dueAt).getTime();
  return Number.isFinite(due) && due < Date.now();
}

/** True when a follow-up row should show the overdue marker. */
export function followUpIsOverdue({
  status,
  dueAt,
}: {
  readonly status: string;
  readonly dueAt: string | null;
}): boolean {
  return isOverdue(status, dueAt);
}

import type { ExpenseStatus } from './api.js';

export const STATUS_LABEL_KEYS: Record<ExpenseStatus, string> = {
  draft: 'expenses.status.draft',
  submitted: 'expenses.status.submitted',
  approved: 'expenses.status.approved',
  rejected: 'expenses.status.rejected',
  paid: 'expenses.status.paid',
};

export const STATUS_ORDER: readonly ExpenseStatus[] = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'paid',
];

export const ACTION_LABEL_KEYS: Record<string, string> = {
  create: 'expenses.action.create',
  update: 'expenses.action.update',
  submit: 'expenses.action.submit',
  approve: 'expenses.action.approve',
  reject: 'expenses.action.reject',
  pay: 'expenses.action.pay',
};

export function statusLabelKey(status: ExpenseStatus): string {
  return STATUS_LABEL_KEYS[status];
}

export function actionLabelKey(action: string): string {
  return ACTION_LABEL_KEYS[action] ?? 'expenses.action.unknown';
}

export function formatAmount(value: number): string {
  return `¥${new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  return value.slice(0, 10);
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const pad = (input: number): string => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

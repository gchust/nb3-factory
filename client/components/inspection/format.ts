import type {
  DeviceStatus,
  InspectionResult,
  InspectionRole,
  PlanCycle,
  PlanStatus,
} from './types.js';

export const DEVICE_STATUS_KEYS: Readonly<Record<DeviceStatus, string>> = {
  in_use: 'inspection.deviceStatus.inUse',
  stopped: 'inspection.deviceStatus.stopped',
  repair: 'inspection.deviceStatus.repair',
};

export const PLAN_CYCLE_KEYS: Readonly<Record<PlanCycle, string>> = {
  daily: 'inspection.cycle.daily',
  weekly: 'inspection.cycle.weekly',
  monthly: 'inspection.cycle.monthly',
};

export const PLAN_STATUS_KEYS: Readonly<Record<PlanStatus, string>> = {
  active: 'inspection.planStatus.active',
  ended: 'inspection.planStatus.ended',
};

export const RESULT_KEYS: Readonly<Record<InspectionResult, string>> = {
  normal: 'inspection.result.normal',
  abnormal: 'inspection.result.abnormal',
};

export const ROLE_KEYS: Readonly<Record<InspectionRole, string>> = {
  admin: 'inspection.roles.admin',
  inspector: 'inspection.roles.inspector',
  teamLead: 'inspection.roles.teamLead',
  viewer: 'inspection.roles.viewer',
  none: 'inspection.roles.none',
};

/** Server "createdAt" values are stored as epoch milliseconds in a string. */
export function toDate(value: string | number | Date): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const numeric = Number(value);
  if (Number.isFinite(numeric) && value.trim() !== '') return new Date(numeric);
  return new Date(value);
}

export function formatDateTime(value: string | number | Date): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

export function formatDate(value: string | number | Date): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  if (index < 0 || index === name.length - 1) return '';
  return name.slice(index + 1).toLowerCase();
}

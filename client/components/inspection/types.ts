export type DeviceStatus = 'in_use' | 'stopped' | 'repair';
export type PlanCycle = 'daily' | 'weekly' | 'monthly';
export type PlanStatus = 'active' | 'ended';
export type InspectionResult = 'normal' | 'abnormal';
export type InspectionRole =
  'admin' | 'inspector' | 'teamLead' | 'viewer' | 'none';

export interface Device {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly location: string;
  readonly type: string;
  readonly status: DeviceStatus;
}

export interface Plan {
  readonly id: number;
  readonly name: string;
  readonly cycle: PlanCycle;
  readonly team: string;
  readonly startDate: string;
  readonly status: PlanStatus;
}

export interface Photo {
  readonly fileId: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly contentUrl: string;
}

export interface InspectionRecord {
  readonly id: number;
  readonly deviceId: number;
  readonly planId: number | null;
  readonly result: InspectionResult;
  readonly description: string | null;
  readonly team: string | null;
  readonly createdById: string;
  readonly createdByName: string | null;
  readonly deviceCode?: string | null;
  readonly deviceName?: string | null;
  readonly planName?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly photos?: readonly Photo[];
}

export interface DeviceStat {
  readonly deviceId: number;
  readonly code: string;
  readonly name: string;
  readonly inspections: number;
  readonly abnormals: number;
}

export interface InspectionUser {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
  readonly role: InspectionRole;
}

export interface DeviceInput {
  readonly code: string;
  readonly name: string;
  readonly location: string;
  readonly type: string;
  readonly status: DeviceStatus;
}

export interface PlanInput {
  readonly name: string;
  readonly cycle: PlanCycle;
  readonly team: string;
  readonly startDate: string;
  readonly status: PlanStatus;
}

export interface RecordFilters {
  readonly deviceId?: number;
  readonly result?: InspectionResult;
  readonly from?: string;
  readonly to?: string;
}

export interface RecordInput {
  readonly deviceId: number;
  readonly planId: number | null;
  readonly result: InspectionResult;
  readonly description: string | null;
  readonly photoIds: readonly string[];
}

export interface RegistrationInput {
  readonly name: string;
  readonly username: string;
  readonly email: string;
  readonly password: string;
  readonly role: 'inspector' | 'teamLead' | 'viewer';
}

export const MAX_PHOTO_BYTES: number = 5 * 1024 * 1024;
export const MAX_PHOTOS: number = 20;
export const ALLOWED_PHOTO_EXTENSIONS: readonly string[] = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'heic',
];

export function canCreateRecord(role: InspectionRole): boolean {
  return role === 'admin' || role === 'teamLead' || role === 'inspector';
}

export function canManageRecord(role: InspectionRole): boolean {
  return role === 'admin' || role === 'teamLead';
}

/**
 * Team leads and administrators may delete any site photo; an inspector may
 * withdraw one from a record they created. A viewer never may.
 */
export function canDeletePhoto(
  role: InspectionRole,
  recordOwnerId: string,
  userId: string | undefined,
): boolean {
  if (role === 'admin' || role === 'teamLead') return true;
  if (role === 'inspector') return Boolean(userId) && recordOwnerId === userId;
  return false;
}

export function canManageCatalog(role: InspectionRole): boolean {
  return role === 'admin';
}

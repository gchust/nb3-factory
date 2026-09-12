/** Client-side view models for the leave-request feature. Mirrors the API shapes. */

export type LeaveRequestType = 'personal' | 'sick' | 'annual' | 'compensatory';
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected';

export const LEAVE_REQUEST_TYPES: readonly LeaveRequestType[] = [
  'personal',
  'sick',
  'annual',
  'compensatory',
] as const;

export const LEAVE_REQUEST_STATUSES: readonly LeaveRequestStatus[] = [
  'pending',
  'approved',
  'rejected',
] as const;

export interface LeaveEvidenceRecord {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  leaveRequestId: number | null;
  contentUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveRequestSummary {
  id: number;
  applicantId: number | null;
  applicantName: string;
  type: LeaveRequestType;
  startAt: string;
  endAt: string;
  days: number;
  reason: string;
  status: LeaveRequestStatus;
  createdAt: string;
  evidenceCount: number;
}

export interface LeaveRequestDetail extends LeaveRequestSummary {
  approvalComment: string | null;
  approvedById: number | null;
  approvedByName: string | null;
  approvedAt: string | null;
  evidenceFiles: LeaveEvidenceRecord[];
}

export interface CreateLeaveRequestInput {
  type: LeaveRequestType;
  startAt: string;
  endAt: string;
  days: number;
  reason: string;
}

export interface LeaveRequestListResponse {
  data: LeaveRequestSummary[];
}

export interface LeaveRequestDetailResponse {
  data: LeaveRequestDetail;
}

export interface LeaveEvidenceUploadResponse {
  data: LeaveEvidenceRecord[];
}

export type LeaveRequestApiErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'ALREADY_PROCESSED'
  | 'UNAUTHORIZED'
  | 'UNSUPPORTED_MEDIA_TYPE';

export interface LeaveRequestApiErrorPayload {
  code?: LeaveRequestApiErrorCode;
  message?: string;
  status?: LeaveRequestStatus;
}

/**
 * Format a date value for display in the current locale.
 * Accepts ISO strings and the numeric (epoch-ms) strings SQLite returns.
 */
export function formatDateTime(value: string, locale: string): string {
  const numeric = value.trim() !== '' && !Number.isNaN(Number(value));
  const date = new Date(numeric ? Number(value) : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Format a file size in a human-readable way. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function errorCodeOf(
  error: unknown,
): LeaveRequestApiErrorCode | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    return (error as { code: LeaveRequestApiErrorCode }).code;
  }
  return undefined;
}

export const leaveTypes = ['annual', 'sick', 'personal', 'unpaid'] as const;
export type LeaveType = (typeof leaveTypes)[number];

export const leaveStatuses = ['pending', 'approved', 'rejected'] as const;
export type LeaveStatus = (typeof leaveStatuses)[number];

export interface LeaveRequest {
  readonly id: string;
  readonly userId: string;
  readonly userName: string;
  readonly type: LeaveType;
  readonly startDate: string;
  readonly endDate: string;
  readonly days: number;
  readonly reason: string;
  readonly status: LeaveStatus;
  readonly reviewerId: string | null;
  readonly reviewerName: string | null;
  readonly reviewComment: string | null;
  readonly submittedAt: string;
  readonly decidedAt: string | null;
}

export interface LeaveStats {
  readonly pending: number;
  readonly approved: number;
  readonly yearTotal: number;
  readonly teamPending: number | null;
}

export interface LeaveListMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface LeaveListResponse {
  readonly data: LeaveRequest[];
  readonly meta: LeaveListMeta;
}

export interface LeaveDataResponse {
  readonly data: LeaveRequest;
}

export interface LeaveStatsResponse {
  readonly data: LeaveStats;
}

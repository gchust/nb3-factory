/**
 * The shapes the HR endpoints answer with.
 *
 * Dates arrive over JSON as ISO strings, so the client types them as strings;
 * the only exception is a `null` the server never sent a value for.
 */

export type EmployeeStatus = 'onboarding' | 'active' | 'offboarded';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';
export type LeaveType = 'annual' | 'sick' | 'personal' | 'other';

export interface HrDepartment {
  readonly id: number;
  readonly title: string;
  readonly code: string | null;
  readonly parentId: number | null;
  readonly managerId: string | null;
  readonly active: boolean;
  readonly sortOrder: number;
  readonly description: string | null;
}

export interface HrEmployee {
  readonly id: number;
  readonly employeeNo: string;
  readonly name: string;
  readonly position: string | null;
  readonly status: EmployeeStatus;
  readonly departmentId: number | null;
  readonly departmentTitle: string | null;
  readonly userId?: string | null;
  readonly hireDate?: string | null;
  readonly offboardedAt?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly idNumber?: string | null;
  readonly idDocumentUrl?: string | null;
  readonly contractNo?: string | null;
  readonly contractStartDate?: string | null;
  readonly contractEndDate?: string | null;
  readonly contractUrl?: string | null;
  readonly attachments?: unknown;
  readonly notes?: string | null;
}

export interface HrLeaveRequest {
  readonly id: number;
  readonly employeeId: number;
  readonly userId: string | null;
  readonly departmentId: number | null;
  readonly type: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly days: number | null;
  readonly reason: string | null;
  readonly status: LeaveStatus;
  readonly approverId: string | null;
  readonly approverName: string | null;
  readonly decidedAt: string | null;
  readonly rejectionReason: string | null;
  readonly revision: number;
  readonly submittedAt: string | null;
}

export interface HrNotification {
  readonly id: number;
  readonly userId: string;
  readonly title: string;
  readonly body: string | null;
  readonly type: string;
  readonly refType: string | null;
  readonly refId: number | null;
  readonly read: boolean;
  readonly createdAt: string;
}

export interface HrDashboard {
  readonly activeEmployees: number;
  readonly onboardingEmployees: number;
  readonly pendingLeaveRequests: number;
  readonly departments: number;
  readonly myPendingLeaveRequests: number;
  readonly myRejectedLeaveRequests: number;
  readonly isHr: boolean;
  readonly isSupervisor: boolean;
  readonly employeeId: number | null;
}

export interface HrList<T> {
  readonly data: T[];
  readonly meta: { readonly total: number };
}

export interface HrData<T> {
  readonly data: T;
}

/** The leave types a request may carry, in display order. */
export const LEAVE_TYPES: readonly LeaveType[] = [
  'annual',
  'sick',
  'personal',
  'other',
];

/** The statuses an employee row may carry, in display order. */
export const EMPLOYEE_STATUSES: readonly EmployeeStatus[] = [
  'active',
  'onboarding',
  'offboarded',
];

/** The statuses a leave request may carry, in display order. */
export const LEAVE_STATUSES: readonly LeaveStatus[] = [
  'pending',
  'approved',
  'rejected',
];

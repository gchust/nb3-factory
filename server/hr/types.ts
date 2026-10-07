/**
 * Shapes of the HR feature's rows and the request-scoped actor the service
 * resolves before doing anything.
 *
 * These mirror the migrations under `database/main/migrations/`; a migration is
 * immutable history, so a field added later appears here as optional only when
 * the row may genuinely lack it.
 */

export type EmployeeStatus = 'onboarding' | 'active' | 'offboarded';

export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface HrDepartmentRow {
  id: number;
  title: string;
  code: string | null;
  parentId: number | null;
  managerId: string | null;
  active: boolean;
  sortOrder: number;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HrEmployeeRow {
  id: number;
  employeeNo: string;
  name: string;
  userId: string | null;
  departmentId: number | null;
  position: string | null;
  status: string;
  hireDate: string | null;
  offboardedAt: Date | null;
  email: string | null;
  phone: string | null;
  idNumber: string | null;
  idDocumentUrl: string | null;
  contractNo: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  contractUrl: string | null;
  attachments: unknown;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HrLeaveRequestRow {
  id: number;
  employeeId: number;
  userId: string | null;
  departmentId: number | null;
  type: string;
  startDate: string;
  endDate: string;
  days: number | null;
  reason: string | null;
  status: string;
  approverId: string | null;
  approverName: string | null;
  decidedAt: Date | null;
  rejectionReason: string | null;
  revision: number;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HrNotificationRow {
  id: number;
  userId: string;
  title: string;
  body: string | null;
  type: string;
  refType: string | null;
  refId: number | null;
  read: boolean;
  createdAt: Date;
}

/**
 * The row of an employee as a given actor may see it.
 *
 * HR and the person themselves see the whole record, including the confidential
 * block (identity document, labour contract, attachments, notes). A supervisor
 * sees only the name, position and status the requirement allows, so this
 * projection is the one place field-level confidentiality is applied.
 */
export interface HrEmployeeView {
  id: number;
  employeeNo: string;
  name: string;
  position: string | null;
  status: string;
  departmentId: number | null;
  departmentTitle: string | null;
  userId?: string | null;
  hireDate?: string | null;
  offboardedAt?: Date | null;
  email?: string | null;
  phone?: string | null;
  idNumber?: string | null;
  idDocumentUrl?: string | null;
  contractNo?: string | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  contractUrl?: string | null;
  attachments?: unknown;
  notes?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/** What one request's actor may do, resolved once and shared by every method. */
export interface HrActor {
  readonly userId: string;
  /** Root or a holder of the unrestricted set. */
  readonly unrestricted: boolean;
  /** Holds the HR permission set (or is unrestricted). */
  readonly isHr: boolean;
  /** Manages at least one department. */
  readonly isSupervisor: boolean;
  /** The actor's own employee record, when they have one. */
  readonly employee: HrEmployeeRow | null;
  /** Departments whose `managerId` is this actor. */
  readonly managedDepartmentIds: readonly number[];
}

/**
 * Request and response schemas for the HR API.
 *
 * They are declarative only: the route validates input with the request
 * schemas through `apiValidator()`, and documents responses with the entity
 * schemas through `dataResponse()` / `listResponse()`. Dates are documented as
 * ISO strings because that is what JSON carries.
 */
import { z } from 'zod';

const isoDate = z.string().describe('ISO 8601 date, such as 2026-12-01');
const isoDateTime = z.string().describe('ISO 8601 date-time');
const nullableString = z.string().nullable();

export const DepartmentSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  code: nullableString,
  parentId: z.number().int().nullable(),
  managerId: nullableString,
  active: z.boolean(),
  sortOrder: z.number().int(),
  description: nullableString,
  createdAt: isoDateTime.optional(),
  updatedAt: isoDateTime.optional(),
});

export const EmployeeSchema = z.object({
  id: z.number().int(),
  employeeNo: z.string(),
  name: z.string(),
  position: nullableString.optional(),
  status: z.string(),
  departmentId: z.number().int().nullable(),
  departmentTitle: nullableString.optional(),
  userId: nullableString.optional(),
  hireDate: nullableString.optional(),
  offboardedAt: nullableString.optional(),
  email: nullableString.optional(),
  phone: nullableString.optional(),
  idNumber: nullableString.optional(),
  idDocumentUrl: nullableString.optional(),
  contractNo: nullableString.optional(),
  contractStartDate: nullableString.optional(),
  contractEndDate: nullableString.optional(),
  contractUrl: nullableString.optional(),
  attachments: z.unknown().optional(),
  notes: nullableString.optional(),
  createdAt: isoDateTime.optional(),
  updatedAt: isoDateTime.optional(),
});

export const LeaveRequestSchema = z.object({
  id: z.number().int(),
  employeeId: z.number().int(),
  userId: nullableString,
  departmentId: z.number().int().nullable(),
  type: z.string(),
  startDate: isoDate,
  endDate: isoDate,
  days: z.number().int().nullable(),
  reason: nullableString,
  status: z.string(),
  approverId: nullableString,
  approverName: nullableString,
  decidedAt: nullableString,
  rejectionReason: nullableString,
  revision: z.number().int(),
  submittedAt: nullableString,
  createdAt: isoDateTime.optional(),
  updatedAt: isoDateTime.optional(),
});

export const NotificationSchema = z.object({
  id: z.number().int(),
  userId: z.string(),
  title: z.string(),
  body: nullableString,
  type: z.string(),
  refType: nullableString,
  refId: z.number().int().nullable(),
  read: z.boolean(),
  createdAt: isoDateTime.optional(),
});

export const DashboardSchema = z.object({
  activeEmployees: z.number().int(),
  onboardingEmployees: z.number().int(),
  pendingLeaveRequests: z.number().int(),
  departments: z.number().int(),
  myPendingLeaveRequests: z.number().int(),
  myRejectedLeaveRequests: z.number().int(),
  isHr: z.boolean(),
  isSupervisor: z.boolean(),
  employeeId: z.number().int().nullable(),
});

// --- request inputs ---------------------------------------------------------

export const DepartmentIdParam = z.object({
  departmentId: z.coerce.number().int(),
});
export const EmployeeIdParam = z.object({
  employeeId: z.coerce.number().int(),
});
export const LeaveRequestIdParam = z.object({
  requestId: z.coerce.number().int(),
});
export const NotificationIdParam = z.object({
  notificationId: z.coerce.number().int(),
});

export const DepartmentCreateInput = z.object({
  title: z.string().min(1),
  code: z.string().max(64).optional(),
  parentId: z.number().int().optional(),
  managerId: z.string().max(64).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  description: z.string().optional(),
});

export const DepartmentUpdateInput = DepartmentCreateInput.partial();

export const EmployeeListQuery = z.object({
  status: z.enum(['onboarding', 'active', 'offboarded']).optional(),
  departmentId: z.coerce.number().int().optional(),
  search: z.string().optional(),
});

export const EmployeeCreateInput = z.object({
  name: z.string().min(1),
  employeeNo: z.string().max(64).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(64).optional(),
  departmentId: z.number().int().optional(),
  position: z.string().max(255).optional(),
  hireDate: isoDate.optional(),
  openAccount: z.boolean().optional(),
  idNumber: z.string().max(64).optional(),
  contractNo: z.string().max(64).optional(),
  contractStartDate: isoDate.optional(),
  contractEndDate: isoDate.optional(),
  notes: z.string().optional(),
});

export const EmployeeUpdateInput = z.object({
  employeeNo: z.string().max(64).optional(),
  name: z.string().min(1).optional(),
  departmentId: z.number().int().nullable().optional(),
  position: z.string().max(255).optional(),
  status: z.enum(['onboarding', 'active', 'offboarded']).optional(),
  hireDate: isoDate.optional(),
  email: z.string().email().optional(),
  phone: z.string().max(64).optional(),
  idNumber: z.string().max(64).optional(),
  idDocumentUrl: z.string().optional(),
  contractNo: z.string().max(64).optional(),
  contractStartDate: isoDate.optional(),
  contractEndDate: isoDate.optional(),
  contractUrl: z.string().optional(),
  attachments: z.unknown().optional(),
  notes: z.string().optional(),
});

export const EmployeeLifecycleInput = z.object({
  action: z.enum(['onboard', 'offboard']),
  email: z.string().email().optional(),
  username: z.string().max(64).optional(),
});

export const LeaveListQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  mine: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const LeaveCreateInput = z.object({
  type: z.enum(['annual', 'sick', 'personal', 'other']).optional(),
  startDate: isoDate,
  endDate: isoDate,
  reason: z.string().max(2000).optional(),
});

export const LeaveUpdateInput = z.object({
  type: z.enum(['annual', 'sick', 'personal', 'other']).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  reason: z.string().max(2000).optional(),
  resubmit: z.boolean().optional(),
});

export const LeaveDecisionInput = z.object({
  decision: z.enum(['approved', 'rejected']),
  rejectionReason: z.string().max(2000).optional(),
});

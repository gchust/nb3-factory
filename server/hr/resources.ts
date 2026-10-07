/**
 * The authorization vocabulary of the HR feature, declared once and reused by
 * the provider that registers it, by the permission sets that grant it, and by
 * the routes that enforce it.
 *
 * Enforcement is by one composite resource, `hr.portal`: a route requires the
 * composite action, and the service applies the row scoping and field
 * confidentiality that action implies. Registering the underlying collections
 * as database resources is the opt-in that lets a grant expand; it also means
 * they are denied to everyone until an HR permission set grants them, which is
 * exactly the boundary the requirement wants.
 */
import {
  defineCompositeResource,
  type CompositeResourceBuilder,
  type CompositeResourceReference,
} from '@nocobase/authorization/core';
import {
  definePermissionSet,
  type PermissionSet,
} from '@nocobase/authorization/permission-sets';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type {
  HrDepartmentRow,
  HrEmployeeRow,
  HrLeaveRequestRow,
  HrNotificationRow,
} from './types.js';

/** The resource every HR API route requires; the service does the rest. */
export const HR_RESOURCE = { type: 'composite' as const, id: 'hr.portal' };

/** Composite action names. CamelCase so they survive any dotted notation. */
export const HR_ACTION = {
  viewEmployees: 'viewEmployees',
  viewEmployeeConfidential: 'viewEmployeeConfidential',
  manageEmployees: 'manageEmployees',
  viewDepartments: 'viewDepartments',
  manageDepartments: 'manageDepartments',
  viewLeave: 'viewLeave',
  applyLeave: 'applyLeave',
  decideLeave: 'decideLeave',
} as const;

export type HrAction = (typeof HR_ACTION)[keyof typeof HR_ACTION];

/** Permission set keys, provisioned at runtime by the HR provider. */
export const HR_SET_KEY = 'hr-hr';
export const SUPERVISOR_SET_KEY = 'hr-supervisor';
export const EMPLOYEE_SET_KEY = 'hr-employee';

export const HR_PAGE_IDS = {
  dashboard: 'hr.dashboard',
  departments: 'hr.departments',
  employees: 'hr.employees',
  leave: 'hr.leave',
  approvals: 'hr.approvals',
  profile: 'hr.profile',
} as const;

/**
 * Readable fields of an employee, as HR and their own record may see them.
 * `employeeNo`, `name`, `position`, `status` and `departmentId` are what a
 * supervisor may see; the rest are personal but not confidential.
 */
const EMPLOYEE_READ_FIELDS = [
  'id',
  'employeeNo',
  'name',
  'userId',
  'departmentId',
  'position',
  'status',
  'hireDate',
  'offboardedAt',
  'email',
  'phone',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof HrEmployeeRow)[];

/** The confidential block: identity document, contract, attachments, notes. */
const EMPLOYEE_CONFIDENTIAL_FIELDS = [
  ...EMPLOYEE_READ_FIELDS,
  'idNumber',
  'idDocumentUrl',
  'contractNo',
  'contractStartDate',
  'contractEndDate',
  'contractUrl',
  'attachments',
  'notes',
] as const satisfies readonly (keyof HrEmployeeRow)[];

const EMPLOYEE_WRITE_FIELDS = [
  'employeeNo',
  'name',
  'userId',
  'departmentId',
  'position',
  'status',
  'hireDate',
  'offboardedAt',
  'email',
  'phone',
  'idNumber',
  'idDocumentUrl',
  'contractNo',
  'contractStartDate',
  'contractEndDate',
  'contractUrl',
  'attachments',
  'notes',
] as const satisfies readonly (keyof HrEmployeeRow)[];

const LEAVE_WRITE_FIELDS = [
  'type',
  'startDate',
  'endDate',
  'days',
  'reason',
] as const satisfies readonly (keyof HrLeaveRequestRow)[];

// --- Database permissions ---------------------------------------------------
// Read/write per collection. Every one offers `allRecords` as its data scope;
// row scoping is a service concern because a record-access resolver is given no
// database, so it cannot express "this supervisor's departments". Keeping the
// scope to `allRecords` here means the grant still opts the collection in,
// while the service narrows what it actually returns.

const departmentRead = defineDatabasePermission<HrDepartmentRow, 'allRecords'>(
  (permission) =>
    permission
      .collection<HrDepartmentRow>('hrDepartments')
      .title('Departments')
      .options(recordAccess.allRecords)
      .default(recordAccess.allRecords)
      .read('*'),
);

const departmentWrite = defineDatabasePermission<HrDepartmentRow, 'allRecords'>(
  (permission) =>
    permission
      .collection<HrDepartmentRow>('hrDepartments')
      .title('Departments (manage)')
      .options(recordAccess.allRecords)
      .default(recordAccess.allRecords)
      .create([
        'title',
        'code',
        'parentId',
        'managerId',
        'active',
        'sortOrder',
        'description',
      ])
      .update([
        'title',
        'code',
        'parentId',
        'managerId',
        'active',
        'sortOrder',
        'description',
      ]),
);

const employeeSafe = defineDatabasePermission<HrEmployeeRow, 'allRecords'>(
  (permission) =>
    permission
      .collection<HrEmployeeRow>('hrEmployees')
      .title('Employees (basic)')
      .options(recordAccess.allRecords)
      .default(recordAccess.allRecords)
      .read(EMPLOYEE_READ_FIELDS),
);

const employeeConfidential = defineDatabasePermission<
  HrEmployeeRow,
  'allRecords'
>((permission) =>
  permission
    .collection<HrEmployeeRow>('hrEmployees')
    .title('Employees (confidential files)')
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords)
    .read(EMPLOYEE_CONFIDENTIAL_FIELDS),
);

const employeeWrite = defineDatabasePermission<HrEmployeeRow, 'allRecords'>(
  (permission) =>
    permission
      .collection<HrEmployeeRow>('hrEmployees')
      .title('Employees (manage)')
      .options(recordAccess.allRecords)
      .default(recordAccess.allRecords)
      .create(EMPLOYEE_WRITE_FIELDS)
      .update(EMPLOYEE_WRITE_FIELDS),
);

const leaveRead = defineDatabasePermission<HrLeaveRequestRow, 'allRecords'>(
  (permission) =>
    permission
      .collection<HrLeaveRequestRow>('hrLeaveRequests')
      .title('Leave requests')
      .options(recordAccess.allRecords)
      .default(recordAccess.allRecords)
      .read('*'),
);

const leaveWrite = defineDatabasePermission<HrLeaveRequestRow, 'allRecords'>(
  (permission) =>
    permission
      .collection<HrLeaveRequestRow>('hrLeaveRequests')
      .title('Leave requests (apply)')
      .options(recordAccess.allRecords)
      .default(recordAccess.allRecords)
      .create(LEAVE_WRITE_FIELDS)
      .update(LEAVE_WRITE_FIELDS),
);

const leaveDecide = defineDatabasePermission<HrLeaveRequestRow, 'allRecords'>(
  (permission) =>
    permission
      .collection<HrLeaveRequestRow>('hrLeaveRequests')
      .title('Leave requests (decide)')
      .options(recordAccess.allRecords)
      .default(recordAccess.allRecords)
      .read('*')
      .update([
        'status',
        'approverId',
        'approverName',
        'decidedAt',
        'rejectionReason',
        'revision',
      ]),
);

const notificationRead = defineDatabasePermission<
  HrNotificationRow,
  'allRecords'
>((permission) =>
  permission
    .collection<HrNotificationRow>('hrNotifications')
    .title('Notifications')
    .options(recordAccess.allRecords)
    .default(recordAccess.allRecords)
    .read('*')
    .create(['userId', 'title', 'body', 'type', 'refType', 'refId', 'read'])
    .update(['read']),
);
void notificationRead;

/**
 * The composite every route asks for. Each action names the underlying grants
 * it expands into, so a permission set can grant exactly one capability.
 */
const hrPortalBuilder: CompositeResourceBuilder<{
  viewEmployees: { employees: 'allRecords' };
  viewEmployeeConfidential: { employees: 'allRecords' };
  manageEmployees: { employees: 'allRecords' };
  viewDepartments: { departments: 'allRecords' };
  manageDepartments: { departments: 'allRecords' };
  viewLeave: { leave: 'allRecords' };
  applyLeave: { leave: 'allRecords' };
  decideLeave: { leave: 'allRecords' };
}> = defineCompositeResource('hr.portal', (resource) =>
  resource
    .title('HR portal')
    .action(HR_ACTION.viewEmployees, (action) =>
      action.title('View employees').grant('employees', employeeSafe),
    )
    .action(HR_ACTION.viewEmployeeConfidential, (action) =>
      action
        .title('View confidential employee files')
        .grant('employees', employeeConfidential),
    )
    .action(HR_ACTION.manageEmployees, (action) =>
      action.title('Manage employees').grant('employees', employeeWrite),
    )
    .action(HR_ACTION.viewDepartments, (action) =>
      action.title('View departments').grant('departments', departmentRead),
    )
    .action(HR_ACTION.manageDepartments, (action) =>
      action.title('Manage departments').grant('departments', departmentWrite),
    )
    .action(HR_ACTION.viewLeave, (action) =>
      action.title('View leave requests').grant('leave', leaveRead),
    )
    .action(HR_ACTION.applyLeave, (action) =>
      action.title('Apply for leave').grant('leave', leaveWrite),
    )
    .action(HR_ACTION.decideLeave, (action) =>
      action.title('Decide leave requests').grant('leave', leaveDecide),
    ),
);

/** The reference used to build permission-set grants. */
export const hrPortal: CompositeResourceReference<{
  viewEmployees: { employees: 'allRecords' };
  viewEmployeeConfidential: { employees: 'allRecords' };
  manageEmployees: { employees: 'allRecords' };
  viewDepartments: { departments: 'allRecords' };
  manageDepartments: { departments: 'allRecords' };
  viewLeave: { leave: 'allRecords' };
  applyLeave: { leave: 'allRecords' };
  decideLeave: { leave: 'allRecords' };
}> = hrPortalBuilder.reference();

/** The definition registered with the authorization workspace at boot. */
export const hrPortalDefinition = hrPortalBuilder;

/** The three permission sets, built against the running authorization. */
export function defineHrPermissionSets(
  authz: AppAuthorization,
): PermissionSet[] {
  return [
    definePermissionSet(HR_SET_KEY)
      .title('HR')
      .grant(
        authz.pages.grant(HR_PAGE_IDS.dashboard),
        authz.pages.grant(HR_PAGE_IDS.departments),
        authz.pages.grant(HR_PAGE_IDS.employees),
        authz.pages.grant(HR_PAGE_IDS.leave),
        authz.pages.grant(HR_PAGE_IDS.approvals),
        authz.pages.grant(HR_PAGE_IDS.profile),
        hrPortal.grant({
          viewEmployees: { employees: 'allRecords' },
          viewEmployeeConfidential: { employees: 'allRecords' },
          manageEmployees: { employees: 'allRecords' },
          viewDepartments: { departments: 'allRecords' },
          manageDepartments: { departments: 'allRecords' },
          viewLeave: { leave: 'allRecords' },
          applyLeave: { leave: 'allRecords' },
          decideLeave: { leave: 'allRecords' },
        }),
      )
      .build(),
    definePermissionSet(SUPERVISOR_SET_KEY)
      .title('Supervisor')
      .grant(
        authz.pages.grant(HR_PAGE_IDS.dashboard),
        authz.pages.grant(HR_PAGE_IDS.departments),
        authz.pages.grant(HR_PAGE_IDS.employees),
        authz.pages.grant(HR_PAGE_IDS.leave),
        authz.pages.grant(HR_PAGE_IDS.approvals),
        authz.pages.grant(HR_PAGE_IDS.profile),
        hrPortal.grant({
          viewEmployees: { employees: 'allRecords' },
          viewDepartments: { departments: 'allRecords' },
          viewLeave: { leave: 'allRecords' },
          applyLeave: { leave: 'allRecords' },
          decideLeave: { leave: 'allRecords' },
        }),
      )
      .build(),
    definePermissionSet(EMPLOYEE_SET_KEY)
      .title('Employee')
      .grant(
        authz.pages.grant(HR_PAGE_IDS.dashboard),
        authz.pages.grant(HR_PAGE_IDS.leave),
        authz.pages.grant(HR_PAGE_IDS.profile),
        hrPortal.grant({
          viewDepartments: { departments: 'allRecords' },
          viewLeave: { leave: 'allRecords' },
          applyLeave: { leave: 'allRecords' },
        }),
      )
      .build(),
  ];
}

import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  home: {
    title: 'Start building your application',
    description:
      'Describe what you need to your AI Agent, then build pages, data models, and business workflows.',
  },

  appearance: {
    title: 'Appearance',
    mode: 'Color mode',
    preset: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    themes: { default: 'Default', compact: 'Compact' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    close: 'Close',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    edit: 'Edit',
    language: 'Language',
  },
  account: {
    openMenu: 'Open account menu',
    fallback: 'Account',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
  },
  navigation: {
    home: 'Home',
    hr: 'Human resources',
    hrEmployees: 'Employees',
    hrDepartments: 'Departments',
    hrLeave: 'Leave requests',
    hrOvertime: 'Overtime',
    hrApprovals: 'Approvals',
    hrStatistics: 'HR statistics',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
  },
  hr: {
    common: {
      loading: 'Loading…',
      none: '—',
      selectPlaceholder: 'Select…',
      status: 'Status',
      statusFilter: 'Filter by status',
      allStatuses: 'All statuses',
      actions: 'Actions',
      download: 'Download',
      unknownEmployee: 'Employee #{{id}}',
    },
    status: {
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
      active: 'Active',
      inactive: 'Inactive',
    },
    employeeStatus: {
      active: 'Active',
      inactive: 'Inactive',
    },
    leaveType: {
      annual: 'Annual leave',
      sick: 'Sick leave',
      personal: 'Personal leave',
    },
    employees: {
      title: 'Employees',
      description: 'Maintain employee records and annual leave entitlement.',
      createTitle: 'New employee',
      editTitle: 'Edit employee',
      name: 'Name',
      employeeNo: 'Employee number',
      department: 'Department',
      position: 'Position',
      hireDate: 'Hire date',
      status: 'Status',
      annualLeaveDays: 'Annual leave days',
      create: 'Add employee',
      listTitle: 'Employee list',
      filterByDepartment: 'Filter by department',
      allDepartments: 'All departments',
      empty: 'No employees.',
      created: 'Employee created.',
      updated: 'Employee updated.',
    },
    departments: {
      title: 'Departments',
      description: 'Maintain departments and their person in charge.',
      createTitle: 'New department',
      editTitle: 'Edit department',
      name: 'Name',
      manager: 'Person in charge',
      create: 'Add department',
      listTitle: 'Department list',
      empty: 'No departments.',
      created: 'Department created.',
      updated: 'Department updated.',
    },
    leave: {
      title: 'Leave requests',
      description:
        'Submit leave, track approval status, and review the annual leave balance.',
      createTitle: 'New leave request',
      editTitle: 'Edit leave request',
      employee: 'Employee',
      type: 'Leave type',
      startDate: 'Start date',
      endDate: 'End date',
      days: 'Leave days',
      daysHint: 'Calculated automatically from the start and end dates.',
      remainingAnnual: 'Remaining annual leave',
      remainingAnnualValue: '{{days}} day(s)',
      reason: 'Reason',
      attachment: 'Sick leave certificate',
      submit: 'Submit request',
      listTitle: 'Leave requests',
      empty: 'No leave requests.',
      created: 'Leave request submitted.',
      updated: 'Leave request updated.',
    },
    overtime: {
      title: 'Overtime requests',
      description:
        'Submit and approve overtime; approved hours feed the monthly total.',
      createTitle: 'New overtime request',
      employee: 'Employee',
      date: 'Overtime date',
      hours: 'Hours',
      reason: 'Reason',
      submit: 'Submit request',
      listTitle: 'Overtime requests',
      empty: 'No overtime requests.',
      created: 'Overtime request submitted.',
    },
    approval: {
      comment: 'Approval comment',
      commentPlaceholder: 'Approval comment',
      approve: 'Approve',
      reject: 'Reject',
      approver: 'Approver',
      done: 'Decision recorded.',
    },
    approvals: {
      title: 'Approvals',
      description: 'Review pending leave and overtime requests.',
      noAccess: 'You do not have approval access.',
      pendingLeave: 'Pending leave requests',
      noPendingLeave: 'No pending leave requests.',
      pendingOvertime: 'Pending overtime requests',
      noPendingOvertime: 'No pending overtime requests.',
    },
    statistics: {
      title: 'HR statistics',
      description:
        'Leave days by department, remaining annual leave, and this month overtime.',
      noAccess: 'You do not have access to HR statistics.',
      overtimeThisMonth: 'Overtime hours this month',
      month: 'Month: {{month}}',
      departmentLeave: 'Leave days by department',
      department: 'Department',
      leaveDays: 'Total leave days',
      overtimeHours: 'Overtime hours this month',
      employeeAnnual: 'Remaining annual leave by employee',
      entitlement: 'Annual entitlement',
      used: 'Used',
      remaining: 'Remaining',
      empty: 'No data yet.',
      unassigned: 'Unassigned',
    },
    errors: {
      HR_FORBIDDEN: 'You are not allowed to perform this action.',
      HR_NOT_FOUND: 'The requested record does not exist.',
      HR_INVALID_INPUT: 'The submitted data is invalid.',
      HR_EMPLOYEE_NO_EXISTS:
        'An employee with this employee number already exists.',
      HR_DEPARTMENT_NAME_EXISTS: 'A department with this name already exists.',
      HR_INVALID_DATE_RANGE:
        'The start date must not be later than the end date.',
      HR_ANNUAL_LEAVE_EXCEEDED:
        'The requested annual leave exceeds the remaining balance ({{remainingAnnualLeaveDays}} day(s) left).',
      HR_LEAVE_APPROVED_IMMUTABLE:
        'An approved leave request can no longer be changed.',
      HR_REQUEST_ALREADY_DECIDED: 'This request has already been decided.',
      HR_REJECTION_COMMENT_REQUIRED:
        'A reason is required when rejecting a request.',
      HR_EMPLOYEE_PROFILE_MISSING:
        'No employee profile is linked to this account yet.',
      HR_UNAUTHENTICATED: 'Sign in required.',
      HR_EMPLOYEE_PROVISION_FAILED:
        'Could not create an employee profile for the account.',
    },
  },
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;

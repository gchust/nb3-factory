import { defineSeed, type SeedDefinition } from '@nocobase/db';

// Example data for the HR suite. Fixed values only, and every insert is
// guarded by a natural key so a repeat `pnpm seed` leaves user edits alone.
const DEPARTMENTS = [
  { name: 'Engineering', managerName: 'Zhang Wei' },
  { name: 'Human Resources', managerName: 'Liu Yang' },
  { name: 'Sales', managerName: null },
] as const;

const EMPLOYEES = [
  {
    employeeNo: 'E1001',
    name: 'Zhang Wei',
    department: 'Engineering',
    position: 'Engineering Manager',
    hireDate: '2023-01-10',
    annualLeaveDays: 15,
  },
  {
    employeeNo: 'E1002',
    name: 'Li Na',
    department: 'Engineering',
    position: 'Software Engineer',
    hireDate: '2024-03-01',
    annualLeaveDays: 10,
  },
  {
    employeeNo: 'E1003',
    name: 'Wang Fang',
    department: 'Human Resources',
    position: 'HR Specialist',
    hireDate: '2022-07-15',
    annualLeaveDays: 12,
  },
] as const;

interface DemoLeaveRequest {
  employeeNo: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
  approverName?: string;
  approvalComment?: string;
}

interface DemoOvertimeRequest {
  employeeNo: string;
  overtimeDate: string;
  hours: number;
  reason: string;
  status: string;
  approverName?: string;
  approvalComment?: string;
}

const LEAVE_REQUESTS: readonly DemoLeaveRequest[] = [
  {
    employeeNo: 'E1001',
    type: 'annual',
    startDate: '2026-09-01',
    endDate: '2026-09-03',
    days: 3,
    reason: 'Family trip',
    status: 'approved',
    approverName: 'HR Admin',
    approvalComment: 'Approved',
  },
  {
    employeeNo: 'E1002',
    type: 'sick',
    startDate: '2026-09-08',
    endDate: '2026-09-09',
    days: 2,
    reason: 'Flu',
    status: 'pending',
  },
  {
    employeeNo: 'E1003',
    type: 'personal',
    startDate: '2026-09-11',
    endDate: '2026-09-11',
    days: 1,
    reason: 'Personal errand',
    status: 'rejected',
    approverName: 'HR Admin',
    approvalComment: 'Peak season, please reschedule',
  },
];

const OVERTIME_REQUESTS: readonly DemoOvertimeRequest[] = [
  {
    employeeNo: 'E1001',
    overtimeDate: '2026-09-05',
    hours: 3,
    reason: 'Release support',
    status: 'approved',
    approverName: 'HR Admin',
    approvalComment: 'Approved',
  },
  {
    employeeNo: 'E1002',
    overtimeDate: '2026-09-09',
    hours: 2.5,
    reason: 'Incident response',
    status: 'pending',
  },
  {
    employeeNo: 'E1003',
    overtimeDate: '2026-09-10',
    hours: 1,
    reason: 'Report preparation',
    status: 'rejected',
    approverName: 'HR Admin',
    approvalComment: 'Not needed this week',
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609130102_seed_hr_demo_data',

  async run({ query }) {
    const now = new Date();

    for (const department of DEPARTMENTS) {
      const existing = await query
        .selectFrom('hrDepartments')
        .select('id')
        .where('name', '=', department.name)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('hrDepartments')
        .values({
          name: department.name,
          managerId: null,
          managerName: department.managerName,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const departmentIds = new Map<string, number>();
    for (const department of DEPARTMENTS) {
      const row = await query
        .selectFrom('hrDepartments')
        .select(['id', 'name'])
        .where('name', '=', department.name)
        .executeTakeFirst();
      if (row) departmentIds.set(department.name, Number(row.id));
    }

    for (const employee of EMPLOYEES) {
      const existing = await query
        .selectFrom('hrEmployees')
        .select('id')
        .where('employeeNo', '=', employee.employeeNo)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('hrEmployees')
        .values({
          name: employee.name,
          employeeNo: employee.employeeNo,
          departmentId: departmentIds.get(employee.department) ?? null,
          position: employee.position,
          hireDate: employee.hireDate,
          status: 'active',
          annualLeaveDays: employee.annualLeaveDays,
          userId: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const employeeIds = new Map<string, number>();
    for (const employee of EMPLOYEES) {
      const row = await query
        .selectFrom('hrEmployees')
        .select(['id', 'employeeNo'])
        .where('employeeNo', '=', employee.employeeNo)
        .executeTakeFirst();
      if (row) employeeIds.set(employee.employeeNo, Number(row.id));
    }

    // Point each department's person-in-charge at the matching employee now
    // that both rows exist.
    const engineeringManager = employeeIds.get('E1001');
    if (engineeringManager !== undefined) {
      await query
        .updateTable('hrDepartments')
        .set({ managerId: engineeringManager, managerName: 'Zhang Wei' })
        .where('name', '=', 'Engineering')
        .execute();
    }
    const hrManager = employeeIds.get('E1003');
    if (hrManager !== undefined) {
      await query
        .updateTable('hrDepartments')
        .set({ managerId: hrManager, managerName: 'Wang Fang' })
        .where('name', '=', 'Human Resources')
        .execute();
    }

    for (const request of LEAVE_REQUESTS) {
      const employeeId = employeeIds.get(request.employeeNo);
      if (employeeId === undefined) continue;
      const existing = await query
        .selectFrom('hrLeaveRequests')
        .select('id')
        .where('employeeId', '=', employeeId)
        .where('startDate', '=', request.startDate)
        .where('type', '=', request.type)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('hrLeaveRequests')
        .values({
          employeeId,
          type: request.type,
          startDate: request.startDate,
          endDate: request.endDate,
          days: request.days,
          reason: request.reason,
          attachmentId: null,
          attachmentName: null,
          status: request.status,
          approverId: null,
          approverName: request.approverName ?? null,
          approvalComment: request.approvalComment ?? null,
          decidedAt: request.status === 'pending' ? null : now,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    for (const request of OVERTIME_REQUESTS) {
      const employeeId = employeeIds.get(request.employeeNo);
      if (employeeId === undefined) continue;
      const existing = await query
        .selectFrom('hrOvertimeRequests')
        .select('id')
        .where('employeeId', '=', employeeId)
        .where('overtimeDate', '=', request.overtimeDate)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('hrOvertimeRequests')
        .values({
          employeeId,
          overtimeDate: request.overtimeDate,
          hours: request.hours,
          reason: request.reason,
          status: request.status,
          approverId: null,
          approverName: request.approverName ?? null,
          approvalComment: request.approvalComment ?? null,
          decidedAt: request.status === 'pending' ? null : now,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseManager } from '@nocobase/db';

import {
  createHrService,
  type HrActor,
  type HrService,
} from '../../server/providers/hr.js';
import {
  assignRole,
  createHrTestDatabase,
  linkUser,
} from './hr-test-database.js';

describe('HR service', () => {
  let database: DatabaseManager;
  let hr: HrService;
  let admin: HrActor;
  let engineering: number;
  let sales: number;
  let alice: { id: number };
  let bob: { id: number };
  let carol: { id: number };
  let managerEmployee: { id: number };

  beforeEach(async () => {
    database = await createHrTestDatabase();
    hr = createHrService(database);

    await assignRole(database, 'user', 'admin-1', 'system-administrator');
    await assignRole(database, 'user', 'hr-1', 'hr');
    await assignRole(database, 'user', 'mgr-1', 'department-manager');
    admin = await hr.resolveActor('admin-1', 'Admin');

    const engineeringDepartment = await hr.createDepartment(
      { name: 'Engineering' },
      admin,
    );
    const salesDepartment = await hr.createDepartment({ name: 'Sales' }, admin);
    engineering = Number(engineeringDepartment.id);
    sales = Number(salesDepartment.id);

    alice = (await hr.createEmployee(
      {
        name: 'Alice',
        employeeNo: 'E1001',
        departmentId: engineering,
        status: 'active',
        annualLeaveDays: 5,
      },
      admin,
    )) as unknown as { id: number };
    bob = (await hr.createEmployee(
      {
        name: 'Bob',
        employeeNo: 'E1002',
        departmentId: engineering,
        status: 'active',
        annualLeaveDays: 10,
      },
      admin,
    )) as unknown as { id: number };
    carol = (await hr.createEmployee(
      {
        name: 'Carol',
        employeeNo: 'E1003',
        departmentId: sales,
        status: 'active',
        annualLeaveDays: 10,
      },
      admin,
    )) as unknown as { id: number };
    managerEmployee = (await hr.createEmployee(
      {
        name: 'Manager',
        employeeNo: 'E2001',
        departmentId: engineering,
        status: 'active',
        annualLeaveDays: 10,
      },
      admin,
    )) as unknown as { id: number };

    await linkUser(database, alice.id, 'emp-a');
    await linkUser(database, bob.id, 'emp-b');
    await linkUser(database, carol.id, 'emp-c');
    await linkUser(database, managerEmployee.id, 'mgr-1');
    await database
      .query()
      .updateTable('hrDepartments')
      .set({ managerId: managerEmployee.id })
      .where('id', '=', engineering)
      .execute();
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('rejects a duplicate employee number', async () => {
    await expect(
      hr.createEmployee(
        {
          name: 'Other',
          employeeNo: 'E1001',
          status: 'active',
          annualLeaveDays: 0,
        },
        admin,
      ),
    ).rejects.toMatchObject({ code: 'HR_EMPLOYEE_NO_EXISTS' });
  });

  it('computes leave days and stores the request as pending', async () => {
    const aliceActor = await hr.resolveActor('emp-a', 'Alice');
    const created = await hr.createLeaveRequest(
      {
        type: 'annual',
        startDate: '2026-09-01',
        endDate: '2026-09-03',
        reason: 'Trip',
      },
      aliceActor,
    );
    expect(Number(created.days)).toBe(3);
    expect(created.status).toBe('pending');
    // A manually supplied day count must be ignored.
    const ignored = await hr.createLeaveRequest(
      {
        type: 'personal',
        startDate: '2026-09-10',
        endDate: '2026-09-10',
        days: 99,
      } as Record<string, unknown>,
      aliceActor,
    );
    expect(Number(ignored.days)).toBe(1);
  });

  it('rejects annual leave beyond the remaining balance', async () => {
    const aliceActor = await hr.resolveActor('emp-a', 'Alice');
    await expect(
      hr.createLeaveRequest(
        {
          type: 'annual',
          startDate: '2026-09-01',
          endDate: '2026-09-06',
        },
        aliceActor,
      ),
    ).rejects.toMatchObject({ code: 'HR_ANNUAL_LEAVE_EXCEEDED' });
  });

  it('rejects a start date later than the end date', async () => {
    const aliceActor = await hr.resolveActor('emp-a', 'Alice');
    await expect(
      hr.createLeaveRequest(
        {
          type: 'annual',
          startDate: '2026-09-10',
          endDate: '2026-09-08',
        },
        aliceActor,
      ),
    ).rejects.toMatchObject({ code: 'HR_INVALID_DATE_RANGE' });
  });

  it('keeps approved leave immutable', async () => {
    const aliceActor = await hr.resolveActor('emp-a', 'Alice');
    const created = await hr.createLeaveRequest(
      { type: 'annual', startDate: '2026-09-01', endDate: '2026-09-03' },
      aliceActor,
    );
    await hr.decideLeaveRequest(
      Number(created.id),
      { status: 'approved', comment: 'OK' },
      admin,
    );
    await expect(
      hr.updateLeaveRequest(Number(created.id), { reason: 'changed' }, admin),
    ).rejects.toMatchObject({ code: 'HR_LEAVE_APPROVED_IMMUTABLE' });
  });

  it('requires a comment to reject and then records the decision', async () => {
    const bobActor = await hr.resolveActor('emp-b', 'Bob');
    const created = await hr.createOvertimeRequest(
      { overtimeDate: '2026-09-09', hours: 2.5, reason: 'Incident' },
      bobActor,
    );
    await expect(
      hr.decideOvertimeRequest(
        Number(created.id),
        { status: 'rejected' },
        admin,
      ),
    ).rejects.toMatchObject({ code: 'HR_REJECTION_COMMENT_REQUIRED' });

    const decided = await hr.decideOvertimeRequest(
      Number(created.id),
      { status: 'rejected', comment: 'Not needed' },
      admin,
    );
    expect(decided.status).toBe('rejected');
    expect(decided.approvalComment).toBe('Not needed');
  });

  it('shows an employee only their own requests', async () => {
    const aliceActor = await hr.resolveActor('emp-a', 'Alice');
    const bobActor = await hr.resolveActor('emp-b', 'Bob');
    await hr.createLeaveRequest(
      { type: 'annual', startDate: '2026-09-01', endDate: '2026-09-01' },
      aliceActor,
    );
    await hr.createLeaveRequest(
      { type: 'personal', startDate: '2026-09-02', endDate: '2026-09-02' },
      bobActor,
    );

    const visibleToAlice = await hr.listLeaveRequests({}, aliceActor);
    expect(visibleToAlice).toHaveLength(1);
    expect(Number(visibleToAlice[0].employeeId)).toBe(alice.id);

    await expect(
      hr.createLeaveRequest(
        {
          employeeId: bob.id,
          type: 'personal',
          startDate: '2026-09-03',
          endDate: '2026-09-03',
        },
        aliceActor,
      ),
    ).rejects.toMatchObject({ code: 'HR_FORBIDDEN' });

    await expect(
      hr.decideLeaveRequest(
        Number(visibleToAlice[0].id),
        { status: 'approved' },
        aliceActor,
      ),
    ).rejects.toMatchObject({ code: 'HR_FORBIDDEN' });
  });

  it('shows a manager only their own department requests', async () => {
    const aliceActor = await hr.resolveActor('emp-a', 'Alice');
    const carolActor = await hr.resolveActor('emp-c', 'Carol');
    await hr.createLeaveRequest(
      { type: 'annual', startDate: '2026-09-01', endDate: '2026-09-01' },
      aliceActor,
    );
    const carolLeave = await hr.createLeaveRequest(
      { type: 'personal', startDate: '2026-09-02', endDate: '2026-09-02' },
      carolActor,
    );

    const manager = await hr.resolveActor('mgr-1', 'Manager');
    const visible = await hr.listLeaveRequests({}, manager);
    expect(visible).toHaveLength(1);
    expect(Number(visible[0].employeeId)).toBe(alice.id);

    await expect(
      hr.decideLeaveRequest(
        Number(carolLeave.id),
        { status: 'approved' },
        manager,
      ),
    ).rejects.toMatchObject({ code: 'HR_FORBIDDEN' });

    const approved = await hr.decideLeaveRequest(
      Number(visible[0].id),
      { status: 'approved', comment: 'OK' },
      manager,
    );
    expect(approved.status).toBe('approved');
  });

  it('provisions an employee profile for a self-registered user', async () => {
    const actor = await hr.resolveActor('new-user', 'New User', {
      provision: true,
    });
    expect(actor.employee).not.toBeNull();
    expect(actor.employee?.userId).toBe('new-user');
    expect(actor.employee?.annualLeaveDays).toBeGreaterThan(0);
    const again = await hr.resolveActor('new-user', 'New User', {
      provision: true,
    });
    expect(again.employee?.id).toBe(actor.employee?.id);
  });

  it('aggregates statistics for the current month', async () => {
    const aliceActor = await hr.resolveActor('emp-a', 'Alice');
    const bobActor = await hr.resolveActor('emp-b', 'Bob');
    const aliceLeave = await hr.createLeaveRequest(
      { type: 'annual', startDate: '2026-09-01', endDate: '2026-09-03' },
      aliceActor,
    );
    await hr.decideLeaveRequest(
      Number(aliceLeave.id),
      { status: 'approved', comment: 'OK' },
      admin,
    );
    await hr.createLeaveRequest(
      { type: 'sick', startDate: '2026-09-08', endDate: '2026-09-09' },
      bobActor,
    );
    await hr.createOvertimeRequest(
      { overtimeDate: '2026-09-05', hours: 3 },
      aliceActor,
    );
    await hr.createOvertimeRequest(
      { overtimeDate: '2026-09-09', hours: 2.5 },
      bobActor,
    );

    const statistics = await hr.statistics(admin);
    const engineeringRow = statistics.departments.find(
      (row) => row.departmentId === engineering,
    );
    expect(engineeringRow?.leaveDays).toBe(5);
    expect(engineeringRow?.overtimeHours).toBe(5.5);
    const aliceRow = statistics.employees.find(
      (row) => row.employeeId === alice.id,
    );
    expect(aliceRow?.remainingAnnualLeaveDays).toBe(2);
    expect(statistics.overtimeHoursThisMonth).toBe(5.5);

    const bobActorResolved = await hr.resolveActor('emp-b', 'Bob');
    await expect(hr.statistics(bobActorResolved)).rejects.toMatchObject({
      code: 'HR_FORBIDDEN',
    });
  });
});

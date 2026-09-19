// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseManager } from '@nocobase/db';

import {
  createExpenseService,
  type ExpenseService,
} from '../../server/providers/expense.js';
import {
  createTestDatabase,
  insertEmployee,
  insertSubmittedReport,
  migrate,
  seedWorkflowFixtures,
} from '../helpers/expense-database.js';

async function errorCode(
  run: () => Promise<unknown>,
): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

function reportInput(): {
  purpose: string;
  items: {
    categoryId: string;
    expenseDate: string;
    amount: number;
    description: string;
  }[];
} {
  return {
    purpose: '出差申请',
    items: [
      {
        categoryId: 'c1',
        expenseDate: '2026-08-05',
        amount: 1200,
        description: '往返高铁',
      },
    ],
  };
}

describe('expense service workflow', () => {
  let database: DatabaseManager;
  let service: ExpenseService;

  beforeEach(async () => {
    database = createTestDatabase();
    await migrate(database);
    await seedWorkflowFixtures(database);
    service = createExpenseService(database);
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('runs draft → submitted → approved → paid and never posts a payment twice', async () => {
    const employee = await service.resolveActor('u-e1', '张伟');
    const created = await service.createReport(employee, reportInput());
    expect(created.report.status).toBe('draft');
    expect(created.report.totalAmount).toBe(1200);
    expect(created.items).toHaveLength(1);

    const submitted = await service.submitReport(employee, created.report.id);
    expect(submitted.report.status).toBe('submitted');

    const manager = await service.resolveActor('u-mgr1', '王强');
    const approved = await service.approveReport(
      manager,
      created.report.id,
      '同意报销',
    );
    expect(approved.report.status).toBe('approved');

    const finance = await service.resolveActor('u-fin', '孙丽');
    const paid = await service.payReport(finance, created.report.id);
    expect(paid.report.status).toBe('paid');
    expect(paid.payment?.amount).toBe(1200);

    expect(
      await errorCode(() => service.payReport(finance, created.report.id)),
    ).toBe('ALREADY_PAID');
    const payments = await database
      .query()
      .selectFrom('expensePayments')
      .select('id')
      .execute();
    expect(payments).toHaveLength(1);
    const actions = await database
      .query()
      .selectFrom('expenseActions')
      .select('action')
      .where('reportId', '=', created.report.id)
      .execute();
    expect(actions.map((row) => String(row.action))).toEqual([
      'create',
      'submit',
      'approve',
      'pay',
    ]);
  });

  it('keeps an employee’s list to their own reports', async () => {
    const employee1 = await service.resolveActor('u-e1', '张伟');
    const employee2 = await service.resolveActor('u-e2', '刘洋');
    await service.createReport(employee1, reportInput());
    const other = await service.createReport(employee2, reportInput());

    const own = await service.listReports(employee1, { scope: 'mine' });
    expect(own.allowed).toBe(true);
    expect(own.data).toHaveLength(1);

    expect(
      await errorCode(() => service.getReport(employee1, other.report.id)),
    ).toBe('FORBIDDEN');
  });

  it('scopes the approval todo to the manager’s department and excludes their own report', async () => {
    const employee1 = await service.resolveActor('u-e1', '张伟');
    const employee2 = await service.resolveActor('u-e2', '刘洋');
    const first = await service.createReport(employee1, reportInput());
    await service.submitReport(employee1, first.report.id);
    const second = await service.createReport(employee2, reportInput());
    await service.submitReport(employee2, second.report.id);
    await insertSubmittedReport(database, {
      id: 'rpt-manager-own',
      number: 'EXP-MGR-0001',
      employeeId: 'emp-mgr1',
      departmentId: 'd1',
      totalAmount: 300,
    });

    const manager1 = await service.resolveActor('u-mgr1', '王强');
    const approvals = await service.listReports(manager1, {
      scope: 'approvals',
    });
    expect(approvals.allowed).toBe(true);
    expect(approvals.data.map((row) => row.id)).toEqual([first.report.id]);

    const manager2 = await service.resolveActor('u-mgr2', '赵敏');
    const otherApprovals = await service.listReports(manager2, {
      scope: 'approvals',
    });
    expect(otherApprovals.data.map((row) => row.id)).toEqual([
      second.report.id,
    ]);

    expect(
      await service.listReports(employee1, { scope: 'approvals' }),
    ).toMatchObject({ allowed: false, data: [] });
  });

  it('refuses self-approval even for a manager', async () => {
    await insertSubmittedReport(database, {
      id: 'rpt-self',
      number: 'EXP-SELF-0001',
      employeeId: 'emp-mgr1',
      departmentId: 'd1',
      totalAmount: 500,
    });
    const manager1 = await service.resolveActor('u-mgr1', '王强');
    expect(
      await errorCode(() => service.approveReport(manager1, 'rpt-self')),
    ).toBe('SELF_APPROVAL_FORBIDDEN');
  });

  it('refuses to pay a reimbursement that is not approved', async () => {
    const employee = await service.resolveActor('u-e1', '张伟');
    const created = await service.createReport(employee, reportInput());
    const finance = await service.resolveActor('u-fin', '孙丽');
    expect(
      await errorCode(() => service.payReport(finance, created.report.id)),
    ).toBe('NOT_APPROVED');
  });

  it('refuses a review from someone who is not a manager', async () => {
    const employee = await service.resolveActor('u-e1', '张伟');
    const created = await service.createReport(employee, reportInput());
    await service.submitReport(employee, created.report.id);
    expect(
      await errorCode(() => service.approveReport(employee, created.report.id)),
    ).toBe('FORBIDDEN');
  });

  it('requires a reason when returning a reimbursement', async () => {
    const employee = await service.resolveActor('u-e1', '张伟');
    const created = await service.createReport(employee, reportInput());
    await service.submitReport(employee, created.report.id);
    const manager = await service.resolveActor('u-mgr1', '王强');
    expect(
      await errorCode(() =>
        service.rejectReport(manager, created.report.id, ''),
      ),
    ).toBe('REASON_REQUIRED');
    const rejected = await service.rejectReport(
      manager,
      created.report.id,
      '发票不全',
    );
    expect(rejected.report.status).toBe('rejected');
    expect(rejected.report.decisionComment).toBe('发票不全');
    expect(
      await errorCode(() =>
        service.updateReport(employee, created.report.id, reportInput()),
      ),
    ).toBe('INVALID_STATE');
  });

  it('refuses to submit when the employee has no manager', async () => {
    await insertEmployee(database, {
      id: 'emp-nomanager',
      userId: 'u-none',
      name: '无经理',
      role: 'employee',
      departmentId: 'd1',
      managerUserId: null,
    });
    const actor = await service.resolveActor('u-none', '无经理');
    const created = await service.createReport(actor, reportInput());
    expect(
      await errorCode(() => service.submitReport(actor, created.report.id)),
    ).toBe('NO_MANAGER');
  });

  it('shows the finance view every report that reached finance', async () => {
    const employee1 = await service.resolveActor('u-e1', '张伟');
    const employee2 = await service.resolveActor('u-e2', '刘洋');
    const first = await service.createReport(employee1, reportInput());
    const second = await service.createReport(employee2, reportInput());
    const manager1 = await service.resolveActor('u-mgr1', '王强');
    const manager2 = await service.resolveActor('u-mgr2', '赵敏');
    await service.submitReport(employee1, first.report.id);
    await service.submitReport(employee2, second.report.id);
    await service.approveReport(manager1, first.report.id);
    await service.approveReport(manager2, second.report.id);

    const finance = await service.resolveActor('u-fin', '孙丽');
    const list = await service.listReports(finance, { scope: 'finance' });
    expect(list.allowed).toBe(true);
    expect(list.data.map((row) => row.id).sort()).toEqual(
      [first.report.id, second.report.id].sort(),
    );
    expect(
      await service.listReports(employee1, { scope: 'finance' }),
    ).toMatchObject({ allowed: false, data: [] });
  });

  it('aggregates statistics from the visible reports', async () => {
    const employee = await service.resolveActor('u-e1', '张伟');
    const created = await service.createReport(employee, reportInput());
    await service.submitReport(employee, created.report.id);
    const manager = await service.resolveActor('u-mgr1', '王强');
    const stats = await service.getStatistics(manager, {});
    expect(stats.reportCount).toBe(1);
    expect(stats.totalAmount).toBe(1200);
    expect(stats.byCategory[0]).toMatchObject({
      categoryName: '差旅费',
      amount: 1200,
      count: 1,
    });
  });

  it('gives the administrator a consistent all-department approvals and statistics view', async () => {
    const employee1 = await service.resolveActor('u-e1', '张伟');
    const employee2 = await service.resolveActor('u-e2', '刘洋');
    const first = await service.createReport(employee1, reportInput());
    const second = await service.createReport(employee2, reportInput());
    await service.submitReport(employee1, first.report.id);
    await service.submitReport(employee2, second.report.id);
    const manager1 = await service.resolveActor('u-mgr1', '王强');
    await service.approveReport(manager1, first.report.id);

    await insertEmployee(database, {
      id: 'emp-admin',
      userId: 'u-admin',
      name: '系统管理员',
      role: 'admin',
      departmentId: null,
      managerUserId: null,
    });
    const admin = await service.resolveActor('u-admin', '系统管理员');

    // Approvals span every department instead of matching an empty department.
    const approvals = await service.listReports(admin, { scope: 'approvals' });
    expect(approvals.allowed).toBe(true);
    expect(approvals.data.map((row) => row.id)).toEqual([second.report.id]);

    // Statistics cover the administrator's full visible scope, not their (empty)
    // own employee row.
    const stats = await service.getStatistics(admin, {});
    expect(stats.reportCount).toBe(2);
    expect(stats.totalAmount).toBe(2400);
    expect(stats.byDepartment.map((row) => row.departmentId).sort()).toEqual([
      'd1',
      'd2',
    ]);
  });
});

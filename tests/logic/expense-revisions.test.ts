// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseManager } from '@nocobase/db';

import {
  createExpenseService,
  type ExpenseActor,
  type ExpenseService,
} from '../../server/providers/expense.js';
import {
  createTestDatabase,
  insertEmployee,
  insertFile,
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
    purpose: '差旅报销',
    items: [
      {
        categoryId: 'c1',
        expenseDate: '2026-08-05',
        amount: 800,
        description: '往返高铁',
      },
    ],
  };
}

describe('expense submission history', () => {
  let database: DatabaseManager;
  let service: ExpenseService;

  beforeEach(async () => {
    database = createTestDatabase();
    await migrate(database);
    await seedWorkflowFixtures(database);
    service = createExpenseService(database, { publicBasePath: '/main' });
  });

  afterEach(async () => {
    await database.destroy();
  });

  async function insertOwnedFile(
    ownerId: string,
    filename = 'receipt.png',
  ): Promise<string> {
    const id = crypto.randomUUID();
    const ext = filename.split('.').pop() ?? 'png';
    await insertFile(database, {
      id,
      filename,
      ext,
      mimeType: ext === 'pdf' ? 'application/pdf' : 'image/png',
      size: 2048,
      ownerId,
    });
    return id;
  }

  async function draftReport(): Promise<{
    actor: ExpenseActor;
    reportId: string;
    itemId: string;
  }> {
    const actor = await service.resolveActor('u-e1', '张伟');
    const created = await service.createReport(actor, reportInput());
    return {
      actor,
      reportId: created.report.id,
      itemId: created.items[0]!.id,
    };
  }

  it('migrates undefined revisions from an old row into a null action revision', async () => {
    const detail = await (async () => {
      const { actor, reportId } = await draftReport();
      return service.getReport(actor, reportId);
    })();
    // A draft was never submitted, so there is no history yet.
    expect(detail.revisions).toEqual([]);
    expect(detail.actions.every((action) => action.revision === null)).toBe(
      true,
    );
  });

  it('keeps the first submission receipts and decision after a return and resubmit', async () => {
    const { actor, reportId, itemId } = await draftReport();
    const firstFile = await insertOwnedFile('u-e1', 'first-receipt.png');
    await service.linkItemFile(actor, reportId, itemId, firstFile);
    await service.submitReport(actor, reportId);

    const manager = await service.resolveActor('u-mgr1', '王强');
    const returned = await service.rejectReport(
      manager,
      reportId,
      '票据不清晰',
    );
    expect(returned.revisions).toHaveLength(1);
    expect(returned.revisions[0]).toMatchObject({
      revision: 1,
      decision: 'rejected',
      comment: '票据不清晰',
      decidedByName: '王强',
    });
    expect(
      returned.revisions[0]!.items[0]!.files.map((file) => file.id),
    ).toEqual([firstFile]);

    // The employee replaces the receipt and sends it back.
    await service.removeFile(actor, firstFile);
    const secondFile = await insertOwnedFile('u-e1', 'second-receipt.png');
    await service.linkItemFile(actor, reportId, itemId, secondFile);
    const resubmitted = await service.submitReport(actor, reportId);

    expect(resubmitted.revisions).toHaveLength(2);
    // The first revision still points at the first receipt, the second at the new one.
    expect(
      resubmitted.revisions[0]!.items[0]!.files.map((file) => file.id),
    ).toEqual([firstFile]);
    expect(
      resubmitted.revisions[1]!.items[0]!.files.map((file) => file.id),
    ).toEqual([secondFile]);
    expect(resubmitted.revisions[0]!.comment).toBe('票据不清晰');
    expect(resubmitted.revisions[1]!.decision).toBeNull();

    // The action trail ties each submit and decision to its own revision, so an
    // old approval never resolves to the material submitted afterwards.
    expect(
      resubmitted.actions.map((action) => [action.action, action.revision]),
    ).toEqual([
      ['create', null],
      ['submit', 1],
      ['reject', 1],
      ['submit', 2],
    ]);

    // The replaced receipt is still stored and still readable by the people who
    // could see the report when it was reviewed.
    expect(await service.canAccessFile(actor, firstFile)).toBe(true);
    expect(await service.canAccessFile(manager, firstFile)).toBe(true);
    const otherDepartment = await service.resolveActor('u-e2', '刘洋');
    expect(await service.canAccessFile(otherDepartment, firstFile)).toBe(false);
    // It can no longer be deleted, because the earlier decision depends on it.
    expect(await errorCode(() => service.removeFile(actor, firstFile))).toBe(
      'HISTORICAL_FILE',
    );
    const stored = await database
      .query()
      .selectFrom('expenseFiles')
      .select('id')
      .where('id', '=', firstFile)
      .execute();
    expect(stored).toHaveLength(1);
  });

  it('keeps the reviewed item and supplement frozen even after the draft changes', async () => {
    const { actor, reportId, itemId } = await draftReport();
    const receipt = await insertOwnedFile('u-e1', 'receipt.png');
    const supplement = await insertOwnedFile('u-e1', 'itinerary.pdf');
    await service.linkItemFile(actor, reportId, itemId, receipt);
    await service.linkReportFile(actor, reportId, supplement);
    await service.submitReport(actor, reportId);
    const manager = await service.resolveActor('u-mgr1', '王强');
    await service.rejectReport(manager, reportId, '请补充说明');

    // Replace the item entirely and drop the supplement from the working draft.
    await service.removeFile(actor, supplement);
    await service.updateReport(actor, reportId, {
      purpose: '差旅报销（重报）',
      items: [
        {
          id: crypto.randomUUID(),
          categoryId: 'c2',
          expenseDate: '2026-08-09',
          amount: 300,
          description: '餐饮',
        },
      ],
    });
    const resubmitted = await service.submitReport(actor, reportId);

    const first = resubmitted.revisions[0]!;
    expect(first.items.map((item) => item.itemId)).toEqual([itemId]);
    expect(first.items[0]!.files.map((file) => file.id)).toEqual([receipt]);
    expect(first.files.map((file) => file.id)).toEqual([supplement]);
    expect(first.fileCount).toBe(2);

    const second = resubmitted.revisions[1]!;
    expect(second.items[0]!.itemId).not.toBe(itemId);
    expect(second.items[0]!.files).toEqual([]);
    expect(second.files).toEqual([]);
    expect(second.fileCount).toBe(0);

    // Frozen materials stay readable through the revision even though the live
    // working links are gone.
    expect(await service.canAccessFile(manager, receipt)).toBe(true);
    expect(await service.canAccessFile(manager, supplement)).toBe(true);
  });

  it('refuses a second submission and does not duplicate the revision', async () => {
    const { actor, reportId } = await draftReport();
    await service.submitReport(actor, reportId);
    expect(await errorCode(() => service.submitReport(actor, reportId))).toBe(
      'INVALID_STATE',
    );
    const revisions = await database
      .query()
      .selectFrom('expenseReportRevisions')
      .select('id')
      .where('reportId', '=', reportId)
      .execute();
    expect(revisions).toHaveLength(1);
    const submits = await database
      .query()
      .selectFrom('expenseActions')
      .select('id')
      .where('reportId', '=', reportId)
      .where('action', '=', 'submit')
      .execute();
    expect(submits).toHaveLength(1);
  });

  it('posts one payment and marks the approved revision paid', async () => {
    const { actor, reportId, itemId } = await draftReport();
    const fileId = await insertOwnedFile('u-e1', 'receipt.png');
    await service.linkItemFile(actor, reportId, itemId, fileId);
    await service.submitReport(actor, reportId);
    const manager = await service.resolveActor('u-mgr1', '王强');
    await service.approveReport(manager, reportId, '同意');
    const finance = await service.resolveActor('u-fin', '孙丽');
    await service.payReport(finance, reportId);

    expect(await errorCode(() => service.payReport(finance, reportId))).toBe(
      'ALREADY_PAID',
    );
    const payments = await database
      .query()
      .selectFrom('expensePayments')
      .select('id')
      .where('reportId', '=', reportId)
      .execute();
    expect(payments).toHaveLength(1);
    const detail = await service.getReport(finance, reportId);
    expect(detail.revisions).toHaveLength(1);
    expect(detail.revisions[0]).toMatchObject({
      revision: 1,
      status: 'paid',
      decision: 'approved',
      comment: '同意',
    });
    // A paid record is read-only for everyone.
    expect(detail.capabilities.canManageFiles).toBe(false);
    expect(detail.capabilities.canDelete).toBe(false);
    expect(await errorCode(() => service.removeFile(actor, fileId))).toBe(
      'INVALID_STATE',
    );
    expect(
      await errorCode(() =>
        service.linkItemFile(actor, reportId, itemId, fileId),
      ),
    ).toBe('INVALID_STATE');
    expect(
      await errorCode(() =>
        service.updateReport(actor, reportId, reportInput()),
      ),
    ).toBe('INVALID_STATE');
    expect(await errorCode(() => service.deleteReport(actor, reportId))).toBe(
      'HISTORICAL_REPORT',
    );
  });

  it('keeps the administrator from editing files once a decision is reached', async () => {
    await insertEmployee(database, {
      id: 'emp-admin',
      userId: 'u-admin',
      name: '系统管理员',
      role: 'admin',
      departmentId: null,
      managerUserId: null,
    });
    const { actor, reportId, itemId } = await draftReport();
    const fileId = await insertOwnedFile('u-e1', 'receipt.png');
    await service.linkItemFile(actor, reportId, itemId, fileId);
    await service.submitReport(actor, reportId);
    const admin = await service.resolveActor('u-admin', '系统管理员');
    expect(
      await errorCode(() =>
        service.linkItemFile(admin, reportId, itemId, fileId),
      ),
    ).toBe('INVALID_STATE');
  });

  it('lets a draft be deleted but keeps a returned report for audit', async () => {
    const { actor, reportId } = await draftReport();
    await draftReport();
    await service.deleteReport(actor, reportId);
    expect(await errorCode(() => service.getReport(actor, reportId))).toBe(
      'NOT_FOUND',
    );

    const returned = await draftReport();
    await service.submitReport(returned.actor, returned.reportId);
    const manager = await service.resolveActor('u-mgr1', '王强');
    await service.rejectReport(manager, returned.reportId, '退回');
    expect(
      await errorCode(() =>
        service.deleteReport(returned.actor, returned.reportId),
      ),
    ).toBe('HISTORICAL_REPORT');
  });

  it('keeps report numbers unique after a draft is deleted', async () => {
    const actor = await service.resolveActor('u-e1', '张伟');
    const first = await service.createReport(actor, reportInput());
    const second = await service.createReport(actor, reportInput());
    await service.deleteReport(actor, first.report.id);
    const third = await service.createReport(actor, reportInput());
    expect(new Set([second.report.number, third.report.number]).size).toBe(2);
  });

  it('ties file access to the report visibility across roles and departments', async () => {
    const { actor, reportId, itemId } = await draftReport();
    const fileId = await insertOwnedFile('u-e1', 'receipt.png');
    await service.linkItemFile(actor, reportId, itemId, fileId);
    await service.submitReport(actor, reportId);

    const sameDepartment = await service.resolveActor('u-mgr1', '王强');
    const otherDepartmentManager = await service.resolveActor('u-mgr2', '赵敏');
    const otherEmployee = await service.resolveActor('u-e2', '刘洋');
    const finance = await service.resolveActor('u-fin', '孙丽');

    expect(await service.canAccessFile(sameDepartment, fileId)).toBe(true);
    expect(await service.canAccessFile(otherDepartmentManager, fileId)).toBe(
      false,
    );
    expect(await service.canAccessFile(otherEmployee, fileId)).toBe(false);
    // Finance only reads material that actually reached finance.
    expect(await service.canAccessFile(finance, fileId)).toBe(false);

    await service.approveReport(sameDepartment, reportId);
    expect(await service.canAccessFile(finance, fileId)).toBe(true);
    expect(await service.canAccessFile(otherDepartmentManager, fileId)).toBe(
      false,
    );

    // The manager who reviewed it keeps the old link after the report leaves the
    // approval queue for payment.
    await service.payReport(finance, reportId);
    expect(await service.canAccessFile(sameDepartment, fileId)).toBe(true);
    expect(await service.canAccessFile(finance, fileId)).toBe(true);
    expect(await service.canAccessFile(otherDepartmentManager, fileId)).toBe(
      false,
    );
  });

  it('keeps department visibility with the report after the employee transfers', async () => {
    const { actor, reportId, itemId } = await draftReport();
    const fileId = await insertOwnedFile('u-e1', 'receipt.png');
    await service.linkItemFile(actor, reportId, itemId, fileId);
    await service.submitReport(actor, reportId);

    // The employee moves to another department after submitting. The report
    // belongs to the department it was filed under, so its review chain keeps
    // access and the new department does not gain any.
    await database
      .query()
      .updateTable('expenseEmployees')
      .set({ departmentId: 'd2' })
      .where('userId', '=', 'u-e1')
      .execute();
    const previousManager = await service.resolveActor('u-mgr1', '王强');
    const newDepartmentManager = await service.resolveActor('u-mgr2', '赵敏');
    expect(await service.canAccessFile(previousManager, fileId)).toBe(true);
    expect(await service.canAccessFile(newDepartmentManager, fileId)).toBe(
      false,
    );
    const stillOwner = await service.resolveActor('u-e1', '张伟');
    expect(await service.canAccessFile(stillOwner, fileId)).toBe(true);
  });
});

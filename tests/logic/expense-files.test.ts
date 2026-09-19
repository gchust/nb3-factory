// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseManager } from '@nocobase/db';
import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import { Hono } from 'hono';

import {
  createExpenseService,
  type ExpenseActor,
  type ExpenseService,
} from '../../server/providers/expense.js';
import { createExpenseFileAccessMiddleware } from '../../server/routes/expense-files.js';
import {
  createTestDatabase,
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

describe('expense attachments', () => {
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

  async function draftReport(
    userId = 'u-e1',
    name = '张伟',
  ): Promise<{ actor: ExpenseActor; reportId: string; itemId: string }> {
    const actor = await service.resolveActor(userId, name);
    const created = await service.createReport(actor, reportInput());
    return {
      actor,
      reportId: created.report.id,
      itemId: created.items[0]!.id,
    };
  }

  async function insertOwnedFile(
    ownerId: string,
    overrides: Partial<{
      ext: string;
      mimeType: string;
      filename: string;
    }> = {},
  ): Promise<string> {
    const id = crypto.randomUUID();
    await insertFile(database, {
      id,
      filename: overrides.filename ?? 'receipt.png',
      ext: overrides.ext ?? 'png',
      mimeType: overrides.mimeType ?? 'image/png',
      size: 2048,
      ownerId,
    });
    return id;
  }

  it('attaches receipts per item and keeps supporting documents separate', async () => {
    const { actor, reportId, itemId } = await draftReport();
    const receiptId = await insertOwnedFile('u-e1');
    const linked = await service.linkItemFile(
      actor,
      reportId,
      itemId,
      receiptId,
    );
    expect(linked.items[0]!.files.map((file) => file.id)).toEqual([receiptId]);
    expect(linked.items[0]!.files[0]!.contentUrl).toBe(
      `/main/expense-files/${receiptId}.png`,
    );
    expect(linked.report.fileCount).toBe(1);
    expect(linked.files).toEqual([]);

    const supplementId = await insertOwnedFile('u-e1', {
      filename: 'itinerary.pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
    });
    const withSupplement = await service.linkReportFile(
      actor,
      reportId,
      supplementId,
    );
    expect(withSupplement.files.map((file) => file.id)).toEqual([supplementId]);
    expect(withSupplement.items[0]!.files).toHaveLength(1);
    expect(withSupplement.report.fileCount).toBe(2);
  });

  it('builds the content URL relative to the application base path', async () => {
    const bare = createExpenseService(database);
    const actor = await bare.resolveActor('u-e1', '张伟');
    const created = await bare.createReport(actor, reportInput());
    const fileId = await insertOwnedFile('u-e1');
    const detail = await bare.linkItemFile(
      actor,
      created.report.id,
      created.items[0]!.id,
      fileId,
    );
    expect(detail.items[0]!.files[0]!.contentUrl).toBe(
      `/expense-files/${fileId}.png`,
    );
  });

  it('refuses to attach an empty file', async () => {
    const { actor, reportId, itemId } = await draftReport();
    const emptyId = crypto.randomUUID();
    await insertFile(database, {
      id: emptyId,
      filename: 'empty.txt',
      ext: 'txt',
      mimeType: 'text/plain',
      size: 0,
      ownerId: 'u-e1',
    });
    expect(
      await errorCode(() =>
        service.linkItemFile(actor, reportId, itemId, emptyId),
      ),
    ).toBe('INVALID_FILE');
  });

  it('refuses to attach a file uploaded by another employee', async () => {
    const { actor, reportId, itemId } = await draftReport();
    const foreign = await insertOwnedFile('u-e2');
    expect(
      await errorCode(() =>
        service.linkItemFile(actor, reportId, itemId, foreign),
      ),
    ).toBe('FORBIDDEN');
  });

  it('links each file at most once', async () => {
    const first = await draftReport();
    const second = await draftReport();
    const fileId = await insertOwnedFile('u-e1');
    await service.linkItemFile(
      first.actor,
      first.reportId,
      first.itemId,
      fileId,
    );
    // Re-attaching to the same item is a no-op rather than an error.
    const repeat = await service.linkItemFile(
      first.actor,
      first.reportId,
      first.itemId,
      fileId,
    );
    expect(repeat.items[0]!.files).toHaveLength(1);
    // Another report cannot take the same file.
    expect(
      await errorCode(() =>
        service.linkReportFile(second.actor, second.reportId, fileId),
      ),
    ).toBe('FILE_ALREADY_LINKED');
  });

  it('freezes attachments once the reimbursement is submitted', async () => {
    const { actor, reportId, itemId } = await draftReport();
    const fileId = await insertOwnedFile('u-e1');
    await service.linkItemFile(actor, reportId, itemId, fileId);
    await service.submitReport(actor, reportId);

    expect(
      await errorCode(() =>
        service.linkItemFile(actor, reportId, itemId, fileId),
      ),
    ).toBe('INVALID_STATE');
    expect(await errorCode(() => service.removeFile(actor, fileId))).toBe(
      'INVALID_STATE',
    );

    const manager = await service.resolveActor('u-mgr1', '王强');
    const otherDepartment = await service.resolveActor('u-e2', '刘洋');
    const finance = await service.resolveActor('u-fin', '孙丽');
    expect(await service.canAccessFile(manager, fileId)).toBe(true);
    expect(await service.canAccessFile(otherDepartment, fileId)).toBe(false);
    expect(await service.canAccessFile(finance, fileId)).toBe(false);
  });

  it('lets finance read attachments once the reimbursement is approved', async () => {
    const { actor, reportId, itemId } = await draftReport();
    const fileId = await insertOwnedFile('u-e1');
    await service.linkItemFile(actor, reportId, itemId, fileId);
    await service.submitReport(actor, reportId);
    const manager = await service.resolveActor('u-mgr1', '王强');
    await service.approveReport(manager, reportId);
    const finance = await service.resolveActor('u-fin', '孙丽');
    expect(await service.canAccessFile(finance, fileId)).toBe(true);
  });

  it('removes a link and its metadata while the report is editable', async () => {
    const { actor, reportId, itemId } = await draftReport();
    const fileId = await insertOwnedFile('u-e1');
    await service.linkItemFile(actor, reportId, itemId, fileId);
    await service.removeFile(actor, fileId);

    const links = await database
      .query()
      .selectFrom('expenseItemFiles')
      .select('id')
      .execute();
    const files = await database
      .query()
      .selectFrom('expenseFiles')
      .select('id')
      .execute();
    expect(links).toHaveLength(0);
    expect(files).toHaveLength(0);
    expect(await service.canAccessFile(actor, fileId)).toBe(false);
  });

  it('keeps an unlinked upload private to the employee who made it', async () => {
    const fileId = await insertOwnedFile('u-e1');
    const owner = await service.resolveActor('u-e1', '张伟');
    const colleague = await service.resolveActor('u-e2', '刘洋');
    const manager = await service.resolveActor('u-mgr1', '王强');
    expect(await service.canAccessFile(owner, fileId)).toBe(true);
    expect(await service.canAccessFile(colleague, fileId)).toBe(false);
    expect(await service.canAccessFile(manager, fileId)).toBe(false);
    expect(await errorCode(() => service.removeFile(colleague, fileId))).toBe(
      'FORBIDDEN',
    );
    await service.removeFile(owner, fileId);
    expect(await service.canAccessFile(owner, fileId)).toBe(false);
  });

  it('preserves receipts when an item is edited and drops them with the item', async () => {
    const { actor, reportId, itemId } = await draftReport();
    const fileId = await insertOwnedFile('u-e1');
    await service.linkItemFile(actor, reportId, itemId, fileId);

    const updated = await service.updateReport(actor, reportId, {
      purpose: '差旅报销（修改）',
      items: [
        {
          id: itemId,
          categoryId: 'c1',
          expenseDate: '2026-08-06',
          amount: 900,
          description: '往返高铁（改签）',
        },
      ],
    });
    expect(updated.items[0]!.id).toBe(itemId);
    expect(updated.items[0]!.files.map((file) => file.id)).toEqual([fileId]);

    const replaced = await service.updateReport(actor, reportId, {
      purpose: '差旅报销（替换明细）',
      items: [
        {
          id: crypto.randomUUID(),
          categoryId: 'c2',
          expenseDate: '2026-08-07',
          amount: 300,
          description: '餐饮',
        },
      ],
    });
    expect(replaced.items[0]!.id).not.toBe(itemId);
    expect(replaced.report.fileCount).toBe(0);
    const files = await database
      .query()
      .selectFrom('expenseFiles')
      .select('id')
      .execute();
    expect(files).toHaveLength(0);
  });

  it('lets a returned reimbursement be corrected and resubmitted with new files', async () => {
    const { actor, reportId, itemId } = await draftReport();
    await service.submitReport(actor, reportId);
    const manager = await service.resolveActor('u-mgr1', '王强');
    await service.rejectReport(manager, reportId, '缺少票据');

    const fileId = await insertOwnedFile('u-e1');
    const detail = await service.linkItemFile(actor, reportId, itemId, fileId);
    expect(detail.items[0]!.files).toHaveLength(1);
    const resubmitted = await service.submitReport(actor, reportId);
    expect(resubmitted.report.status).toBe('submitted');
  });
});

describe('expense file content guard', () => {
  let database: DatabaseManager;
  let service: ExpenseService;
  let app: Hono<AuthEnv>;

  beforeEach(async () => {
    database = createTestDatabase();
    await migrate(database);
    await seedWorkflowFixtures(database);
    service = createExpenseService(database);
    app = new Hono<AuthEnv>();
    app.use('*', async (context, next) => {
      const userId = context.req.header('x-test-user');
      context.set(
        'auth',
        userId ? ({ user: { id: userId, name: userId } } as never) : null,
      );
      await next();
    });
    app.use(
      '/expense-files/*',
      async (context, next) => {
        if (!context.get('auth')) {
          return context.json({ code: 'UNAUTHORIZED' }, 401);
        }
        await next();
      },
      createExpenseFileAccessMiddleware(service),
    );
    app.get('/expense-files/:file', (context) => context.text('bytes'));
  });

  afterEach(async () => {
    await database.destroy();
  });

  async function seedSubmittedFile(): Promise<string> {
    const employee = await service.resolveActor('u-e1', '张伟');
    const created = await service.createReport(employee, reportInput());
    const fileId = crypto.randomUUID();
    await insertFile(database, {
      id: fileId,
      filename: 'receipt.png',
      ext: 'png',
      mimeType: 'image/png',
      size: 2048,
      ownerId: 'u-e1',
    });
    await service.linkItemFile(
      employee,
      created.report.id,
      created.items[0]!.id,
      fileId,
    );
    await service.submitReport(employee, created.report.id);
    return fileId;
  }

  it('rejects an anonymous request', async () => {
    const fileId = await seedSubmittedFile();
    const response = await app.request(`/expense-files/${fileId}.png`);
    expect(response.status).toBe(401);
  });

  it('serves bytes to the owner and the reviewing manager only', async () => {
    const fileId = await seedSubmittedFile();
    const owner = await app.request(`/expense-files/${fileId}.png`, {
      headers: { 'x-test-user': 'u-e1' },
    });
    expect(owner.status).toBe(200);
    expect(await owner.text()).toBe('bytes');

    const manager = await app.request(`/expense-files/${fileId}.png`, {
      headers: { 'x-test-user': 'u-mgr1' },
    });
    expect(manager.status).toBe(200);

    const colleague = await app.request(`/expense-files/${fileId}.png`, {
      headers: { 'x-test-user': 'u-e2' },
    });
    expect(colleague.status).toBe(403);

    const finance = await app.request(`/expense-files/${fileId}.png`, {
      headers: { 'x-test-user': 'u-fin' },
    });
    expect(finance.status).toBe(403);
  });

  it('refuses a malformed or unknown file path', async () => {
    const malformed = await app.request('/expense-files/not-a-uuid.png', {
      headers: { 'x-test-user': 'u-e1' },
    });
    expect(malformed.status).toBe(404);

    const unknown = await app.request(
      `/expense-files/${crypto.randomUUID()}.png`,
      { headers: { 'x-test-user': 'u-e1' } },
    );
    expect(unknown.status).toBe(403);
  });
});

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  ExpenseClaimService,
  ExpenseClaimValidationError,
} from '../../server/providers/expense-claims.js';
import {
  createTestDatabase,
  migrate,
  type TestDatabase,
} from '../helpers/test-database.js';

async function insertReceiptFile(
  database: TestDatabase,
  filename: string,
): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await database.manager
    .query('main')
    .insertInto('expenseClaimFiles')
    .values({
      id,
      disk: 'local',
      key: `objects/${id}.txt`,
      filename,
      ext: filename.split('.').pop() ?? '',
      mimeType: 'text/plain',
      size: 12,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  return id;
}

describe('ExpenseClaimService', () => {
  let database: TestDatabase;
  let service: ExpenseClaimService;

  beforeAll(async () => {
    database = createTestDatabase();
    await migrate(database.manager);
    service = new ExpenseClaimService(database.manager);
  });

  afterAll(async () => {
    await database.dispose();
  });

  beforeEach(async () => {
    await database.manager
      .query('main')
      .deleteFrom('expenseClaimAttachments')
      .allowAllRows()
      .execute();
    await database.manager
      .query('main')
      .deleteFrom('expenseClaims')
      .allowAllRows()
      .execute();
  });

  it('stores a claim with its receipt files and reads them back', async () => {
    const first = await insertReceiptFile(database, 'invoice-a.txt');
    const second = await insertReceiptFile(database, 'invoice-b.txt');

    const created = await service.create({
      reason: 'Client lunch',
      amount: 128.5,
      expenseDate: '2026-09-10',
      attachmentIds: [first, second],
    });

    expect(created.reason).toBe('Client lunch');
    expect(created.amount).toBe(128.5);
    expect(created.expenseDate).toBe('2026-09-10');
    expect(created.attachments.map((file) => file.filename)).toEqual([
      'invoice-a.txt',
      'invoice-b.txt',
    ]);

    const reloaded = await service.get(created.id);
    expect(reloaded?.attachments).toHaveLength(2);

    const list = await service.list();
    expect(list).toHaveLength(1);
    expect(list[0].attachmentCount).toBe(2);
    expect(list[0].amount).toBe(128.5);
  });

  it('persists through a separate service instance on the same database', async () => {
    const fileId = await insertReceiptFile(database, 'receipt.txt');
    const created = await service.create({
      reason: 'Taxi',
      amount: 42,
      expenseDate: '2026-09-11',
      attachmentIds: [fileId],
    });

    const fresh = new ExpenseClaimService(database.manager);
    const reloaded = await fresh.get(created.id);
    expect(reloaded?.reason).toBe('Taxi');
    expect(reloaded?.attachments).toHaveLength(1);
    expect(reloaded?.attachments[0].filename).toBe('receipt.txt');
  });

  it('rejects a claim whose attachment does not exist', async () => {
    await expect(
      service.create({
        reason: 'Unknown file',
        amount: 10,
        expenseDate: '2026-09-12',
        attachmentIds: [randomUUID()],
      }),
    ).rejects.toBeInstanceOf(ExpenseClaimValidationError);
  });

  it('rejects a claim without attachments', async () => {
    await expect(
      service.create({
        reason: 'No receipts',
        amount: 10,
        expenseDate: '2026-09-12',
        attachmentIds: [],
      }),
    ).rejects.toBeInstanceOf(ExpenseClaimValidationError);
  });

  it('rejects a non-positive amount', async () => {
    const fileId = await insertReceiptFile(database, 'receipt.txt');
    await expect(
      service.create({
        reason: 'Bad amount',
        amount: 0,
        expenseDate: '2026-09-12',
        attachmentIds: [fileId],
      }),
    ).rejects.toBeInstanceOf(ExpenseClaimValidationError);
  });

  it('rejects a file already linked to another claim', async () => {
    const fileId = await insertReceiptFile(database, 'receipt.txt');
    await service.create({
      reason: 'First',
      amount: 10,
      expenseDate: '2026-09-12',
      attachmentIds: [fileId],
    });

    await expect(
      service.create({
        reason: 'Second',
        amount: 20,
        expenseDate: '2026-09-13',
        attachmentIds: [fileId],
      }),
    ).rejects.toBeInstanceOf(ExpenseClaimValidationError);
  });

  it('returns undefined for a claim that does not exist', async () => {
    expect(await service.get(9999)).toBeUndefined();
  });
});

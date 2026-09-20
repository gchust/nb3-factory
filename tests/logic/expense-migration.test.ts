// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DatabaseManager } from '@nocobase/db';

import {
  createTestDatabase,
  migrate,
  rollback,
} from '../helpers/expense-database.js';

const TABLES = [
  'expenseDepartments',
  'expenseCategories',
  'expenseEmployees',
  'expenseReports',
  'expenseItems',
  'expensePayments',
  'expenseActions',
  'expenseFiles',
  'expenseItemFiles',
  'expenseReportFiles',
  'expenseReportRevisions',
  'expenseRevisionItems',
  'expenseRevisionFiles',
] as const;

describe('expense schema migration', () => {
  let database: DatabaseManager;

  beforeEach(() => {
    database = createTestDatabase();
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('creates every expense table', async () => {
    await migrate(database);
    for (const table of TABLES) {
      expect(await database.builder().hasCollection(table)).toBe(true);
    }
  });

  it('keeps one revision number per report and a nullable action revision', async () => {
    await migrate(database);
    const now = new Date('2026-08-01T00:00:00.000Z');
    const query = database.query();
    await query
      .insertInto('expenseReportRevisions')
      .values({
        id: 'rev-1',
        reportId: 'r-1',
        revision: 1,
        status: 'submitted',
        decision: null,
        comment: null,
        decidedBy: null,
        decidedByName: null,
        submittedAt: now,
        decidedAt: null,
        createdAt: now,
      })
      .execute();
    await expect(
      query
        .insertInto('expenseReportRevisions')
        .values({
          id: 'rev-2',
          reportId: 'r-1',
          revision: 1,
          status: 'submitted',
          decision: null,
          comment: null,
          decidedBy: null,
          decidedByName: null,
          submittedAt: now,
          decidedAt: null,
          createdAt: now,
        })
        .execute(),
    ).rejects.toThrow();

    await query
      .insertInto('expenseRevisionFiles')
      .values({
        id: 'rf-1',
        revisionId: 'rev-1',
        reportId: 'r-1',
        itemId: null,
        fileId: 'f-1',
        filename: 'receipt.png',
        ext: 'png',
        mimeType: 'image/png',
        size: 10,
        kind: 'receipt',
        createdAt: now,
      })
      .execute();
    const files = await query
      .selectFrom('expenseRevisionFiles')
      .selectAll()
      .execute();
    expect(files).toHaveLength(1);

    await query
      .insertInto('expenseActions')
      .values({
        id: 'a-1',
        reportId: 'r-1',
        action: 'submit',
        actorId: 'u-1',
        actorName: '测试',
        fromStatus: 'draft',
        toStatus: 'submitted',
        comment: null,
        revision: 1,
        createdAt: now,
      })
      .execute();
    const action = await query
      .selectFrom('expenseActions')
      .selectAll()
      .where('id', '=', 'a-1')
      .executeTakeFirst<{ revision: number | null }>();
    expect(Number(action?.revision)).toBe(1);
  });

  it('stores a complete report row and rejects duplicate business keys', async () => {
    await migrate(database);
    const now = new Date('2026-08-01T00:00:00.000Z');
    const query = database.query();
    await query
      .insertInto('expenseReports')
      .values({
        id: 'r-1',
        number: 'EXP-2026-0001',
        employeeId: 'e-1',
        departmentId: 'd-1',
        status: 'draft',
        totalAmount: 100.5,
        purpose: '测试',
        submittedAt: null,
        decidedAt: null,
        paidAt: null,
        decidedBy: null,
        decisionComment: null,
        paidBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const stored = await query
      .selectFrom('expenseReports')
      .selectAll()
      .where('id', '=', 'r-1')
      .executeTakeFirst();
    expect(Number(stored?.totalAmount)).toBe(100.5);
    expect(stored?.purpose).toBe('测试');

    await expect(
      query
        .insertInto('expenseReports')
        .values({
          id: 'r-2',
          number: 'EXP-2026-0001',
          employeeId: 'e-1',
          departmentId: 'd-1',
          status: 'draft',
          totalAmount: 0,
          purpose: null,
          submittedAt: null,
          decidedAt: null,
          paidAt: null,
          decidedBy: null,
          decisionComment: null,
          paidBy: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute(),
    ).rejects.toThrow();

    await query
      .insertInto('expensePayments')
      .values({
        id: 'p-1',
        reportId: 'r-1',
        amount: 100.5,
        paidBy: 'u-fin',
        paidAt: now,
        createdAt: now,
      })
      .execute();
    await expect(
      query
        .insertInto('expensePayments')
        .values({
          id: 'p-2',
          reportId: 'r-1',
          amount: 100.5,
          paidBy: 'u-fin',
          paidAt: now,
          createdAt: now,
        })
        .execute(),
    ).rejects.toThrow();
  });

  it('drops every table on rollback and rebuilds them on re-migrate', async () => {
    await migrate(database);
    await rollback(database);
    for (const table of TABLES) {
      expect(await database.builder().hasCollection(table)).toBe(false);
    }
    await migrate(database);
    for (const table of TABLES) {
      expect(await database.builder().hasCollection(table)).toBe(true);
    }
    // Migration 3 re-adds the revision column on the rebuilt actions table.
    const rows = await database
      .query()
      .selectFrom('expenseActions')
      .select('revision')
      .execute();
    expect(rows).toEqual([]);
  });
});

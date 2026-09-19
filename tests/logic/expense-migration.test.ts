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

  it('drops every table on rollback', async () => {
    await migrate(database);
    await rollback(database);
    for (const table of TABLES) {
      expect(await database.builder().hasCollection(table)).toBe(false);
    }
  });
});

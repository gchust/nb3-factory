import {
  InMemoryCollectionMetadataStore,
  createDatabaseManager,
  type DatabaseConnection,
  type DatabaseManager,
  type MigrationConnection,
  type MigrationDefinition,
} from '@nocobase/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609150001_create_expense_system.js';

const EXPECTED_TABLES = [
  'departments',
  'department_members',
  'expense_claims',
  'expense_items',
  'loans',
  'expense_claim_attachments',
  'invoice_files',
];

describe('expense system migration', () => {
  let database: DatabaseManager;
  let connection: DatabaseConnection;

  beforeAll(async () => {
    database = createDatabaseManager({
      default: 'main',
      connections: {
        main: {
          dialect: 'sqlite',
          filename: ':memory:',
          metadataStore: new InMemoryCollectionMetadataStore(),
        },
      },
    });
    connection = await database.connect('main');
  });

  afterAll(async () => {
    await database.disconnect('main');
  });

  async function apply(direction: 'up' | 'down'): Promise<void> {
    const context = {
      builder: database.builder('main'),
      query: database.query('main'),
      connection: connection as MigrationConnection,
    };
    const definition = migration as MigrationDefinition;
    const operation = direction === 'up' ? definition.up : definition.down;
    if (!operation) return;
    await operation(context);
  }

  async function tables(): Promise<ReadonlySet<string>> {
    const rows = await database
      .query('main')
      .selectFrom('sqlite_master')
      .select(['name', 'type'])
      .where('type', '=', 'table')
      .execute();
    return new Set(rows.map((row) => String(row.name)));
  }

  it('creates every collection and reverses them on down', async () => {
    await apply('up');
    const created = await tables();
    for (const table of EXPECTED_TABLES) {
      expect(created.has(table), `expected table ${table}`).toBe(true);
    }

    await apply('down');
    const remaining = await tables();
    for (const table of EXPECTED_TABLES) {
      expect(remaining.has(table), `expected ${table} to be dropped`).toBe(
        false,
      );
    }
  });

  it('stores money as integer cents and dates as day strings', async () => {
    await apply('up');
    const query = database.query('main');
    const now = Date.now();
    const inserted = await query
      .insertInto('expenseClaims')
      .values({
        number: 'BX-TEST-0001',
        applicantId: 'user-1',
        departmentId: null,
        reason: 'test',
        expenseDate: '2026-09-01',
        totalCents: 12345,
        status: 'pending',
        rejectReason: null,
        paymentDate: null,
        loanId: null,
        createdById: 'user-1',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await query
      .insertInto('expenseItems')
      .values({
        claimId: Number(inserted.insertId),
        category: 'travel',
        amountCents: 12345,
        remark: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const claim = await query
      .selectFrom('expenseClaims')
      .select(['expenseDate', 'totalCents'])
      .where('number', '=', 'BX-TEST-0001')
      .executeTakeFirstOrThrow();
    expect(claim.totalCents).toBe(12345);
    expect(claim.expenseDate).toBe('2026-09-01');

    await apply('down');
  });
});

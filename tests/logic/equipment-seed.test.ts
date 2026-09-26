// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';

import type { DatabaseManager } from '@nocobase/db';

import {
  applyMigrations,
  createTestDatabase,
  runSeeds,
} from './equipment-support';

interface EquipmentRow {
  id: number;
  assetCode: string;
  name: string;
  category: string | null;
  notes: string | null;
  createdAt: string;
}

interface LoanRow {
  id: number;
  equipmentId: number;
  borrower: string;
  borrowedAt: string;
  expectedReturnAt: string;
  returnedAt: string | null;
  createdAt: string;
}

type LoanState = 'borrowed' | 'overdue' | 'returned' | 'none';

/**
 * The seed is the installation's starting data. These tests run it against a
 * real database twice, so the assertion is not "it inserted rows once" but
 * "the second run changes nothing and a user's edit survives".
 */
describe('default equipment seed', () => {
  let database: DatabaseManager | undefined;

  afterEach(async () => {
    await database?.destroy();
    database = undefined;
  });

  async function openSeededDatabase(): Promise<DatabaseManager> {
    database = createTestDatabase();
    await applyMigrations(database);
    await runSeeds(database);
    return database;
  }

  function equipmentRepository(connection: DatabaseManager) {
    return connection.repository<EquipmentRow>('equipment');
  }

  function loanRepository(connection: DatabaseManager) {
    return connection.repository<LoanRow>('equipmentLoans');
  }

  async function loanState(
    connection: DatabaseManager,
    assetCode: string,
    now: number,
  ): Promise<LoanState> {
    const equipment = await equipmentRepository(connection).findOne({
      filter: { assetCode },
    });
    expect(equipment).toBeDefined();
    const loans = await loanRepository(connection).findMany({
      filter: { equipmentId: equipment!.id },
    });
    if (loans.length === 0) {
      return 'none';
    }
    const active = loans.find((loan) => loan.returnedAt === null);
    if (active === undefined) {
      return 'returned';
    }
    return Date.parse(active.expectedReturnAt) < now ? 'overdue' : 'borrowed';
  }

  it('seeds five devices and their borrow history', async () => {
    const connection = await openSeededDatabase();

    await expect(equipmentRepository(connection).count()).resolves.toBe(5);
    await expect(loanRepository(connection).count()).resolves.toBe(4);
  });

  it('covers available, borrowed, overdue and returned devices', async () => {
    const connection = await openSeededDatabase();
    const now = Date.now();

    await expect(loanState(connection, 'EQ-2024-001', now)).resolves.toBe(
      'none',
    );
    await expect(loanState(connection, 'EQ-2024-002', now)).resolves.toBe(
      'borrowed',
    );
    await expect(loanState(connection, 'EQ-2024-003', now)).resolves.toBe(
      'overdue',
    );
    await expect(loanState(connection, 'EQ-2024-004', now)).resolves.toBe(
      'returned',
    );
    await expect(loanState(connection, 'EQ-2024-005', now)).resolves.toBe(
      'returned',
    );
  });

  it('records a returned device with both its borrow and return times', async () => {
    const connection = await openSeededDatabase();
    const equipment = await equipmentRepository(connection).findOne({
      filter: { assetCode: 'EQ-2024-004' },
    });
    const loans = await loanRepository(connection).findMany({
      filter: { equipmentId: equipment!.id },
    });

    expect(loans).toHaveLength(1);
    expect(loans[0]!.returnedAt).not.toBeNull();
    expect(Date.parse(loans[0]!.returnedAt!)).toBeGreaterThan(
      Date.parse(loans[0]!.borrowedAt),
    );
  });

  it('changes nothing when run again over existing data', async () => {
    const connection = await openSeededDatabase();

    const first = await equipmentRepository(connection).findOne({
      filter: { assetCode: 'EQ-2024-001' },
    });
    await equipmentRepository(connection).updateOne({
      filter: { id: first!.id },
      values: { name: '用户修改过的名称' },
    });

    // A separate history table makes the seed body run a second time; the
    // history mechanism alone would have skipped it.
    await runSeeds(connection, { tableName: '__test_equipment_seed_history' });

    await expect(equipmentRepository(connection).count()).resolves.toBe(5);
    await expect(loanRepository(connection).count()).resolves.toBe(4);
    const reread = await equipmentRepository(connection).findOne({
      filter: { assetCode: 'EQ-2024-001' },
    });
    expect(reread!.name).toBe('用户修改过的名称');
  });
});

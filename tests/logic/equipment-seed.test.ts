// @vitest-environment node
import {
  createAppDatabaseManager,
  resolveDatabaseConfig,
} from '@nocobase/app-server/database';
import { createAppPaths } from '@nocobase/app-server/config';
import type { DatabaseManager, SeedContext } from '@nocobase/db';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import seed from '../../database/main/seeds/202607200003_seed_office_equipment_demo.js';
import {
  createEquipmentService,
  type EquipmentRecord,
  type LoanRecord,
} from '../../server/providers/equipment-service.js';

/**
 * The sample data an empty installation starts with, and the two properties
 * that make it safe to run repeatedly: the same asset number is updated rather
 * than duplicated, and a second run adds nothing.
 *
 * The story the seed has to leave behind is one device normally out, one
 * device overdue, and one loan that already came back.
 */

const root = process.cwd();
const migrationsDirectory = path.join(root, 'database/main/migrations');
const seedsDirectory = path.join(root, 'database/main/seeds');

let database: DatabaseManager;

async function migrate(database: DatabaseManager): Promise<void> {
  await database
    .createMigrator({
      directory: migrationsDirectory,
      packageName: 'app',
      container: { resolve: () => undefined as never },
    })
    .latest();
}

beforeEach(async () => {
  const paths = createAppPaths({
    rootDir: root,
    storageDir: path.join(root, 'storage'),
  });
  const config = await resolveDatabaseConfig({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: ':memory:',
        schemaManagement: 'managed',
      },
    },
  });
  database = createAppDatabaseManager(config, paths);
  await database.connect();
  await migrate(database);
});

afterEach(async () => {
  await database.destroy();
});

/** The seed only reads `repository`; the rest of the context is real on install. */
function seedContext(): SeedContext {
  return {
    repository: (name: string) => database.repository(name),
  } as unknown as SeedContext;
}

describe('office equipment sample data', () => {
  it('is recorded by the seeder and skipped on a second run', async () => {
    const seeder = database.createSeeder({
      database,
      directory: seedsDirectory,
      packageName: 'app',
      container: { resolve: () => undefined as never },
    });

    const first = await seeder.run();
    expect(first.executed).toContain('202607200003_seed_office_equipment_demo');

    const second = await seeder.run();
    expect(second.executed).toEqual([]);
    expect(second.skipped).toContain('202607200003_seed_office_equipment_demo');
  });

  it('leaves five devices, two out, one overdue and one returned loan', async () => {
    await seed.run(seedContext());

    const equipment = database.repository<EquipmentRecord>('officeEquipment');
    const loans = database.repository<LoanRecord>('equipmentLoans');

    const devices = await equipment.findMany({
      sort: (sort) => sort.field('assetNo').asc(),
    });
    expect(devices).toHaveLength(5);
    expect(devices.map((device) => device.assetNo)).toEqual([
      'EQ-1001',
      'EQ-1002',
      'EQ-1003',
      'EQ-1004',
      'EQ-1005',
    ]);
    expect(
      devices.filter((device) => device.status === 'available'),
    ).toHaveLength(3);
    expect(
      devices.filter((device) => device.status === 'borrowed'),
    ).toHaveLength(2);

    // The numbers the ledger header shows, computed by the real service.
    const service = createEquipmentService(database);
    expect((await service.listEquipment({})).stats).toEqual({
      total: 5,
      borrowed: 2,
      overdue: 1,
    });

    const history = await loans.findMany({
      sort: (sort) => sort.field('id').asc(),
    });
    expect(history).toHaveLength(3);
    expect(history.filter((loan) => loan.returnedAt !== null)).toHaveLength(1);

    const overdue = await service.listLoans({ status: 'active' });
    expect(overdue.filter((loan) => loan.overdue)).toHaveLength(1);
    expect(overdue.filter((loan) => !loan.overdue)).toHaveLength(1);
  });

  it('updates an existing device instead of adding a duplicate', async () => {
    const equipment = database.repository<EquipmentRecord>('officeEquipment');
    const now = new Date();
    await equipment.createOne({
      values: {
        assetNo: 'EQ-1001',
        name: 'Old name',
        category: '',
        notes: '',
        status: 'available',
        createdAt: now,
        updatedAt: now,
      },
    });

    await seed.run(seedContext());
    await seed.run(seedContext());

    const devices = await equipment.findMany({});
    expect(devices).toHaveLength(5);
    const dell = devices.find((device) => device.assetNo === 'EQ-1001');
    expect(dell?.name).toContain('Dell Latitude');
    const loans = await database
      .repository<LoanRecord>('equipmentLoans')
      .findMany({});
    expect(loans).toHaveLength(3);
  });
});

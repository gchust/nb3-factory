// @vitest-environment node
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
  type MigrationContext,
  type SeedContext,
} from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { ServiceContainer } from '@nocobase/service-provider';
import { afterEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/20250925000001_create_customer_memos.js';
import seed from '../../database/main/seeds/20250925000002_customer_memos_sample.js';

interface CustomerMemoRow {
  readonly id: number;
  readonly customerName: string;
  readonly remark?: string | null;
  readonly createdAt: string;
}

/**
 * A real, empty SQLite database per test. `pool: { min: 1, max: 1 }` keeps the
 * in-memory database on one connection: a second pooled connection would see a
 * different empty database, and the test would silently read nothing.
 */
function createManager(): DatabaseManager {
  return createDatabaseManager({
    default: 'main',
    metadataStore: new InMemoryCollectionMetadataStore(),
    drivers: { sqlite: sqlite.driver },
    connections: {
      main: sqlite({
        filename: ':memory:',
        schemaManagement: 'managed',
        pool: { min: 1, max: 1 },
      }),
    },
  });
}

async function migrationContext(
  manager: DatabaseManager,
): Promise<MigrationContext> {
  const connection = await manager.connect('main');
  return {
    builder: connection.builder,
    query: connection.query,
    repository: (collection: string) => connection.repository(collection),
    connection,
    config: { get: () => undefined },
    container: new ServiceContainer(),
  } as unknown as MigrationContext;
}

async function seedContext(manager: DatabaseManager): Promise<SeedContext> {
  const connection = await manager.connect('main');
  return {
    repository: (collection: string) => connection.repository(collection),
    query: connection.query,
    connection,
    config: { get: () => undefined },
    container: new ServiceContainer(),
  } as unknown as SeedContext;
}

const managers: DatabaseManager[] = [];

function trackManager(): DatabaseManager {
  const manager = createManager();
  managers.push(manager);
  return manager;
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.destroy()));
});

describe('customer memo migration', () => {
  it('creates the table, columns and constraints, and the repository can write to it', async () => {
    const manager = trackManager();
    const context = await migrationContext(manager);

    await migration.up(context);

    const collection = await manager.collections('main').get('customerMemos');
    expect(collection?.name).toBe('customerMemos');

    const repository = manager.repository<CustomerMemoRow>('customerMemos');

    // The three columns accept a normal row and read back what was written.
    const created = await repository.createOne({
      values: {
        customerName: 'Contoso Ltd.',
        remark: 'Written by the migration test.',
        createdAt: '2025-09-20T10:00:00.000Z',
      },
    });
    const read = await repository.findOne({
      filter: { id: created.record.id },
    });
    expect(read).toMatchObject({
      customerName: 'Contoso Ltd.',
      remark: 'Written by the migration test.',
    });

    // The optional remark really is optional.
    const withoutRemark = await repository.createOne({
      values: {
        customerName: 'No Remark Co.',
        createdAt: '2025-09-20T11:00:00.000Z',
      },
    });
    expect(withoutRemark.record.remark ?? null).toBeNull();

    // The required customer name is enforced by the schema, not only by the route.
    await expect(
      repository.createOne({
        values: { createdAt: '2025-09-20T12:00:00.000Z' },
      }),
    ).rejects.toThrow();
  });

  it('drops the table again in down', async () => {
    const manager = trackManager();
    const context = await migrationContext(manager);

    await migration.up(context);
    expect(
      await manager.collections('main').get('customerMemos'),
    ).toBeDefined();

    await migration.down?.(context);

    expect(
      await manager.collections('main').get('customerMemos'),
    ).toBeUndefined();
  });
});

describe('customer memo seed', () => {
  it('inserts the three samples once and never overwrites an existing record', async () => {
    const manager = trackManager();
    await migration.up(await migrationContext(manager));
    const repository = manager.repository<CustomerMemoRow>('customerMemos');

    await seed.run(await seedContext(manager));
    const first = await repository.findMany({});
    expect(first).toHaveLength(3);
    expect(first.map((row) => row.customerName).sort()).toEqual([
      'Acme Trading Co.',
      'Globex Manufacturing',
      'Northwind Logistics',
    ]);

    // A repeat run inserts nothing: the sample names already exist.
    await seed.run(await seedContext(manager));
    expect(await repository.findMany({})).toHaveLength(3);

    // A user edit to a sample record survives a later run.
    await repository.updateOne({
      filter: { customerName: 'Acme Trading Co.' },
      values: { remark: 'Edited by a user.' },
    });
    await seed.run(await seedContext(manager));
    const afterEdit = await repository.findMany({});
    expect(afterEdit).toHaveLength(3);
    expect(
      afterEdit.find((row) => row.customerName === 'Acme Trading Co.')?.remark,
    ).toBe('Edited by a user.');
  });
});

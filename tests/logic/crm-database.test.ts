// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDatabaseManager,
  type DatabaseManager,
  type MigrationContext,
  type SeedContext,
} from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';
import { ServiceContainer } from '@nocobase/service-provider';
import { afterEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202610020001_create_sales_crm.ts';
import seed from '../../database/main/seeds/202610020002_demo_sales_crm.ts';

/** The migration and seed contexts only read `get`, so an empty reader is enough. */
const emptyConfig = { get: <T = unknown>() => undefined as T | undefined };

interface CustomerRecord {
  id: number;
  name: string;
  industry: string | null;
}

interface ContactRecord {
  id: number;
  name: string;
  customerId: number;
  customer?: { id: number; name: string } | null;
}

const managers: DatabaseManager[] = [];
const tempDirs: string[] = [];

async function createTestDatabase(): Promise<DatabaseManager> {
  const dir = mkdtempSync(path.join(tmpdir(), 'crm-database-'));
  tempDirs.push(dir);
  const manager = createDatabaseManager({
    default: 'main',
    connections: {
      main: sqlite({ filename: path.join(dir, 'test.sqlite') }),
    },
  });
  managers.push(manager);
  await manager.connect();
  return manager;
}

function migrationContext(database: DatabaseManager): MigrationContext {
  return {
    config: emptyConfig,
    container: new ServiceContainer(),
    builder: database.builder(),
    query: database.query(),
    repository: <TRecord extends object>(collection: string) =>
      database.repository<TRecord>(collection),
    connection: database.connection(),
  } as unknown as MigrationContext;
}

function seedContext(database: DatabaseManager): SeedContext {
  return {
    config: emptyConfig,
    container: new ServiceContainer(),
    repository: <TRecord extends object>(collection: string) =>
      database.repository<TRecord>(collection),
    query: database.query(),
    connection: database.connection(),
  } as unknown as SeedContext;
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.destroy()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('sales CRM migration', () => {
  it('creates the three collections and removes them on rollback', async () => {
    const database = await createTestDatabase();
    const context = migrationContext(database);

    await migration.up(context);

    await expect(database.builder().hasCollection('customers')).resolves.toBe(
      true,
    );
    await expect(database.builder().hasCollection('contacts')).resolves.toBe(
      true,
    );
    await expect(
      database.builder().hasCollection('opportunities'),
    ).resolves.toBe(true);

    // The relation metadata is real: a repository include resolves the owning
    // customer through the declared `belongsTo`, not a front-end join.
    const customer = await database
      .repository<CustomerRecord>('customers')
      .createOne({
        values: { name: 'Relation Co', industry: 'Testing' },
      });
    await database.repository<ContactRecord>('contacts').createOne({
      values: { name: 'Rel Contact', customerId: customer.record.id },
    });
    const contacts = await database
      .repository<ContactRecord>('contacts')
      .findMany({
        select: (select) =>
          select
            .fields('id', 'name', 'customerId')
            .include('customer', (relation) => relation.fields('id', 'name')),
      });
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.customer?.name).toBe('Relation Co');

    await migration.down(context);

    await expect(database.builder().hasCollection('customers')).resolves.toBe(
      false,
    );
    await expect(database.builder().hasCollection('contacts')).resolves.toBe(
      false,
    );
    await expect(
      database.builder().hasCollection('opportunities'),
    ).resolves.toBe(false);
    await expect(
      database.query().selectFrom('contacts').select(['id']).execute(),
    ).rejects.toBeDefined();
  });

  it('rejects an opportunity whose owning customer does not exist', async () => {
    const database = await createTestDatabase();
    await migration.up(migrationContext(database));

    await expect(
      database.repository('opportunities').createOne({
        values: { name: 'Orphan', customerId: 9999, amount: 1, stage: 'won' },
      }),
    ).rejects.toBeDefined();
  });

  it('runs the sample seed twice without adding or overwriting records', async () => {
    const database = await createTestDatabase();
    await migration.up(migrationContext(database));
    const context = seedContext(database);

    await seed.run(context);
    const customers = database.repository<CustomerRecord>('customers');
    const first = await customers.findMany({
      sort: (sort) => sort.field('id').asc(),
    });
    expect(first).toHaveLength(2);
    expect(await database.repository('contacts').count()).toBe(3);
    expect(await database.repository('opportunities').count()).toBe(3);

    // A user edit must survive a repeat run: change a field the seed matches
    // by name, seed again, and the edited value stays.
    await customers.updateOne({
      filter: { name: 'Acme Manufacturing' },
      values: { industry: 'Advanced manufacturing' },
    });
    await seed.run(context);

    expect(await database.repository('customers').count()).toBe(2);
    const after = await customers.findMany({
      sort: (sort) => sort.field('id').asc(),
    });
    expect(
      after.find((row) => row.name === 'Acme Manufacturing')?.industry,
    ).toBe('Advanced manufacturing');
  });
});

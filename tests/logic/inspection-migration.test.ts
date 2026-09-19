import path from 'node:path';

import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import rolesSeed from '../../database/main/seeds/202609190101_seed_app_roles.js';
import usersSeed from '../../database/main/seeds/202609190102_seed_demo_users.js';
import businessSeed from '../../database/main/seeds/202609190103_seed_demo_business_data.js';

interface SchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
  };
}

describe('inspection migrations', () => {
  let database: DatabaseManager;

  beforeEach(() => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('creates the business tables and reverses them on rollback', async () => {
    // The account-default migration alters a table owned by the
    // authentication plugin, so that schema must exist first.
    await migratePackage(database, '@nocobase/app-plugin-authentication');
    const migrator = createMigrator({
      database,
      packageName: 'app',
      directory: path.resolve('database/main/migrations'),
    });
    await migrator.latest();

    const client = await database.connection().client<SchemaClient>();
    for (const table of [
      'equipment',
      'inspection_templates',
      'inspection_template_items',
      'inspection_tasks',
      'inspection_results',
      'repair_orders',
      'repair_order_records',
      'app_files',
      'inspection_result_attachments',
      'repair_order_attachments',
    ]) {
      await expect(client.schema.hasTable(table)).resolves.toBe(true);
    }
    await expect(
      client.schema.hasColumn('inspection_tasks', 'planned_date'),
    ).resolves.toBe(true);
    await expect(
      client.schema.hasColumn('repair_orders', 'source_result_id'),
    ).resolves.toBe(true);
    await expect(
      client.schema.hasColumn('app_files', 'mime_type'),
    ).resolves.toBe(true);

    await migrator.rollback();
    for (const table of ['equipment', 'inspection_tasks', 'repair_orders']) {
      await expect(client.schema.hasTable(table)).resolves.toBe(false);
    }
  });
});

describe('inspection seeds', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    await migratePackage(database, '@nocobase/app-plugin-authentication');
    await migratePackage(database, '@nocobase/app-plugin-authorization');
    await createMigrator({
      database,
      packageName: 'app',
      directory: path.resolve('database/main/migrations'),
    }).latest();
  });

  afterEach(async () => {
    await database.destroy();
  });

  async function runSeeds(): Promise<void> {
    const query = database.query();
    const connection = database.connection();
    for (const seed of [rolesSeed, usersSeed, businessSeed]) {
      await seed.run({ query, connection });
    }
  }

  it('seeds the demo workflow once and stays idempotent on a second run', async () => {
    await runSeeds();
    await runSeeds();

    const query = database.query();
    const count = async (table: string): Promise<number> => {
      const rows = await query.selectFrom(table).select('id').execute();
      return rows.length;
    };

    expect(await count('equipment')).toBe(8);
    expect(await count('inspectionTemplates')).toBe(2);
    expect(await count('inspectionTemplateItems')).toBe(9);
    expect(await count('inspectionTasks')).toBe(10);
    expect(await count('repairOrders')).toBe(4);

    const permissionSets = await query
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'title'])
      .execute();
    const keys = permissionSets.map((row) => String(row.key)).sort();
    expect(keys).toEqual([
      'default-pages',
      'equipment-manager',
      'inspector',
      'repairer',
    ]);

    const assignments = (
      await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select(['subjectId', 'permissionSetKey'])
        .execute()
    ).filter((row) => row.permissionSetKey !== 'default-pages');
    expect(assignments).toHaveLength(4);
    const inspectorAssignments = assignments.filter(
      (row) => row.permissionSetKey === 'inspector',
    );
    const repairerAssignments = assignments.filter(
      (row) => row.permissionSetKey === 'repairer',
    );
    expect(inspectorAssignments).toHaveLength(2);
    expect(repairerAssignments).toHaveLength(2);

    const orders = await query
      .selectFrom('repairOrders')
      .select(['status', 'assigneeId'])
      .execute();
    const statuses = orders.map((row) => String(row.status)).sort();
    expect(statuses).toEqual(['pending', 'processing', 'returned', 'review']);
    expect(
      new Set(orders.map((row) => String(row.assigneeId))).size,
    ).toBeGreaterThanOrEqual(2);

    const tasks = await query
      .selectFrom('inspectionTasks')
      .select(['status', 'assigneeId'])
      .execute();
    expect(tasks.filter((row) => row.status === 'submitted')).toHaveLength(3);
    expect(new Set(tasks.map((row) => String(row.assigneeId))).size).toBe(2);
  });
});

async function migratePackage(
  database: DatabaseManager,
  packageName: string,
): Promise<void> {
  const { default: plugin } = await import(packageName + '/server');
  if (!plugin.baseDir || !plugin.database?.migrations) {
    throw new Error('Missing plugin migrations: ' + packageName);
  }
  await createMigrator({
    database,
    packageName,
    directory: path.resolve(plugin.baseDir, plugin.database.migrations),
  }).latest();
}

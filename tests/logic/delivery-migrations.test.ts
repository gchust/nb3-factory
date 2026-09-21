// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import schemaMigration from '../../database/main/migrations/202609200001_create_project_delivery_schema.js';
import fileMigration from '../../database/main/migrations/202609200002_create_project_delivery_file_collections.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture(): DatabaseManager {
  const parent = path.resolve('tests/.tmp');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'delivery-migration-'));
  roots.push(root);
  return createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: path.join(root, 'main.sqlite') },
    },
  });
}

async function tableExists(
  manager: DatabaseManager,
  table: string,
): Promise<boolean> {
  try {
    await manager.query().selectFrom(table).selectAll().limit(1).execute();
    return true;
  } catch {
    return false;
  }
}

describe('contract delivery migrations', () => {
  it('creates every business and file collection and reverses them', async () => {
    const manager = fixture();
    const builder = manager.builder('main');

    await schemaMigration.up({ builder } as never);
    await fileMigration.up({ builder } as never);

    for (const table of [
      'deliveryCustomers',
      'deliveryContacts',
      'deliveryProjects',
      'deliveryProjectMembers',
      'deliveryChangeRecords',
      'deliveryMilestones',
      'deliveryTasks',
      'deliveryAcceptanceBatches',
      'deliverySettlements',
      'deliverySettlementPayments',
      'deliveryRoleAssignments',
      'deliveryFileLinks',
      'deliveryProjectFiles',
      'deliveryTaskFiles',
      'deliverySettlementFiles',
    ]) {
      expect(
        await tableExists(manager, table),
        `expected ${table} to exist`,
      ).toBe(true);
    }

    // The file Collections must carry exactly the columns the File Repository
    // validates before it will store or serve anything.
    await manager
      .query()
      .insertInto('deliveryProjectFiles')
      .values({
        id: '1f0a0000-0000-4000-8000-0000000000ff',
        disk: 'local',
        key: 'objects/probe.txt',
        filename: 'probe.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        size: 5,
        createdAt: '2026-01-05T09:00:00.000',
        updatedAt: '2026-01-05T09:00:00.000',
      } as never)
      .execute();

    await fileMigration.down({ builder } as never);
    expect(await tableExists(manager, 'deliveryProjectFiles')).toBe(false);
    expect(await tableExists(manager, 'deliveryTaskFiles')).toBe(false);
    expect(await tableExists(manager, 'deliverySettlementFiles')).toBe(false);

    await schemaMigration.down({ builder } as never);
    expect(await tableExists(manager, 'deliveryProjects')).toBe(false);
    expect(await tableExists(manager, 'deliveryMilestones')).toBe(false);
    expect(await tableExists(manager, 'deliverySettlements')).toBe(false);
  });

  it('enforces the unique contract number', async () => {
    const manager = fixture();
    const builder = manager.builder('main');
    await schemaMigration.up({ builder } as never);
    const query = manager.query();
    const row = {
      contractNo: 'CT-DUP',
      title: 'One',
      customerId: 1,
      amountCents: 100,
      currency: 'CNY',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'draft',
      createdAt: '2026-01-05T09:00:00.000',
      updatedAt: '2026-01-05T09:00:00.000',
    };
    await query
      .insertInto('deliveryProjects')
      .values({ id: 1, ...row } as never)
      .execute();
    await expect(
      query
        .insertInto('deliveryProjects')
        .values({ id: 2, ...row } as never)
        .execute(),
    ).rejects.toThrow();
  });
});

import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  type DatabaseManager,
  type MigrationContext,
  type QueryAdapter,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609190001_create_delivery_tables.js';
import usersSeed from '../../database/main/seeds/202609190001_seed_delivery_demo_users.js';
import dataSeed from '../../database/main/seeds/202609190002_seed_delivery_demo_data.js';
import grantsSeed from '../../database/main/seeds/202609190003_grant_delivery_pages.js';

describe('delivery demo seeds', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: {
        main: { dialect: 'sqlite', filename: ':memory:' },
      },
    });
    const connection = database.connection();
    await migration.up({
      builder: database.builder(),
      query: connection.query,
      connection,
    } as unknown as MigrationContext);
    await createAuthenticationTables(database);
    await createAuthorizationTables(database);
  });

  afterEach(async () => {
    await database.destroy();
  });

  async function runSeeds(): Promise<void> {
    const connection = database.connection();
    const context = { query: connection.query, connection };
    await usersSeed.run(context);
    await dataSeed.run(context);
    await grantsSeed.run(context);
  }

  it('seeds the requested fictional dataset across two teams', async () => {
    await runSeeds();
    const query = database.connection().query;

    const counts = await Promise.all([
      count(query, 'deliveryProjects'),
      count(query, 'deliveryMilestones'),
      count(query, 'deliveryTasks'),
      count(query, 'deliverySubmissions'),
      count(query, 'deliveryTaskResults'),
    ]);
    expect(counts).toEqual([4, 10, 24, 5, 24]);

    const statuses = await query
      .selectFrom('deliverySubmissions')
      .select(['status'])
      .execute();
    const byStatus = statuses.reduce<Record<string, number>>(
      (accumulator, row) => {
        const status = String(row.status);
        accumulator[status] = (accumulator[status] ?? 0) + 1;
        return accumulator;
      },
      {},
    );
    expect(byStatus).toEqual({ approved: 2, pending: 2, returned: 1 });

    const resubmission = await query
      .selectFrom('deliverySubmissions')
      .select(['previousSubmissionId', 'round'])
      .where('round', '=', 2)
      .executeTakeFirstOrThrow();
    expect(Number(resubmission.previousSubmissionId)).toBe(3);

    const tasks = await query
      .selectFrom('deliveryTasks')
      .select(['assigneeId'])
      .execute();
    const assignees = new Set(tasks.map((task) => String(task.assigneeId)));
    expect(assignees.size).toBeGreaterThanOrEqual(4);

    const secondVersion = await query
      .selectFrom('deliveryTaskResultVersions')
      .select(['versionNo'])
      .where('versionNo', '=', 2)
      .executeTakeFirst();
    expect(secondVersion).toBeDefined();
  });

  it('keeps milestone status consistent with tasks and submissions', async () => {
    await runSeeds();
    const query = database.connection().query;

    const milestones = await query
      .selectFrom('deliveryMilestones')
      .select(['id', 'name', 'status'])
      .execute();
    const violations: string[] = [];
    for (const milestone of milestones) {
      const milestoneId = Number(milestone.id);
      const tasks = await query
        .selectFrom('deliveryTasks')
        .select(['status'])
        .where('milestoneId', '=', milestoneId)
        .execute();
      const submissions = await query
        .selectFrom('deliverySubmissions')
        .select(['status'])
        .where('milestoneId', '=', milestoneId)
        .execute();

      // A delivery application may only exist once every task is done.
      const hasApplication = submissions.length > 0;
      if (hasApplication && tasks.some((task) => task.status !== 'done')) {
        violations.push(
          `${String(milestone.name)}: 有交付申请但仍有未完成任务`,
        );
      }
      // `completed` means accepted, which requires an approved application.
      if (
        milestone.status === 'completed' &&
        !submissions.some(
          (submission) => String(submission.status) === 'approved',
        )
      ) {
        violations.push(
          `${String(milestone.name)}: 标记为已完成但没有已通过的交付申请`,
        );
      }
    }
    expect(violations).toEqual([]);
  });

  it('is idempotent: running the seeds twice changes nothing', async () => {
    await runSeeds();
    await runSeeds();
    const query = database.connection().query;

    await expect(count(query, 'deliveryProjects')).resolves.toBe(4);
    await expect(count(query, 'deliveryMilestones')).resolves.toBe(10);
    await expect(count(query, 'deliveryTasks')).resolves.toBe(24);
    await expect(count(query, 'deliverySubmissions')).resolves.toBe(5);
    await expect(count(query, 'deliverySubmissionItems')).resolves.toBe(14);
    await expect(count(query, 'user')).resolves.toBe(8);
    await expect(count(query, 'deliverySubmissionComments')).resolves.toBe(4);

    await expect(count(query, 'authorizationPermissionSets')).resolves.toBe(1);
    await expect(
      count(query, 'authorizationPermissionSetAssignments'),
    ).resolves.toBe(1);
  });

  it('does nothing before the delivery schema exists', async () => {
    const fresh = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    try {
      const connection = fresh.connection();
      await expect(
        dataSeed.run({ query: connection.query, connection }),
      ).resolves.toBeUndefined();
    } finally {
      await fresh.destroy();
    }
  });
});

async function count(query: QueryAdapter, table: string): Promise<number> {
  const rows = await query.selectFrom(table).select(['id']).execute();
  return rows.length;
}

async function createAuthenticationTables(
  database: DatabaseManager,
): Promise<void> {
  await database.builder().createCollection('user', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('name', { length: 255 }).notNull();
    collection.string('username', { length: 255 }).nullable();
    collection.string('email', { length: 320 }).notNull();
    collection.boolean('emailVerified').notNull().defaultTo(false);
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.primary('id');
  });
  await database.builder().createCollection('account', (collection) => {
    collection.string('id', { length: 64 }).notNull();
    collection.string('issuer', { length: 255 }).notNull();
    collection.string('accountId', { length: 320 }).notNull();
    collection.string('providerId', { length: 128 }).notNull();
    collection.string('userId', { length: 64 }).notNull();
    collection.text('password').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.primary('id');
  });
}

async function createAuthorizationTables(
  database: DatabaseManager,
): Promise<void> {
  await database
    .builder()
    .createCollection('authorizationPermissionSets', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('key', { length: 128 }).notNull();
      collection.string('title', { length: 255 }).nullable();
      collection.json('grants').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id');
      collection.unique('key');
    });
  await database
    .builder()
    .createCollection('authorizationPermissionSetAssignments', (collection) => {
      collection.string('id', { length: 255 }).notNull();
      collection.string('subjectType', { length: 64 }).notNull();
      collection.string('subjectId', { length: 128 }).notNull();
      collection.string('permissionSetKey', { length: 128 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id');
    });
}

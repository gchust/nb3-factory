import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import rolesSeed, {
  INSPECTOR_ROLE,
  PRODUCTION_LEAD_ROLE,
  QUALITY_SUPERVISOR_ROLE,
  TRIAL_PASSWORD as SEED_TRIAL_PASSWORD,
  TRIAL_USERS,
} from '../../database/main/seeds/202609190002_seed_quality_roles_and_users.js';
import {
  TRIAL_ACCOUNTS,
  TRIAL_PASSWORD,
} from '../../client/pages/auth/trial-credentials.js';
import sampleSeed from '../../database/main/seeds/202609190003_seed_quality_sample_data.js';
import migration from '../../database/main/migrations/202609190001_create_quality_tables.js';
import roundMigration from '../../database/main/migrations/202609190005_add_quality_rounds_and_reviews.js';
import {
  createIdentityTables,
  createQualityDatabase,
  type QualityTestDatabase,
} from './quality-test-helpers.js';

describe('quality schema migration', () => {
  let context: QualityTestDatabase;

  beforeEach(async () => {
    context = await createQualityDatabase();
  });

  afterEach(async () => {
    await context.dispose();
  });

  it('creates every quality collection and accepts rows', async () => {
    const { builder } = context.connection;
    for (const name of [
      'products',
      'productionBatches',
      'inspectionTasks',
      'inspectionItems',
      'nonconformances',
    ]) {
      await expect(builder.hasCollection(name)).resolves.toBe(true);
    }

    const now = new Date();
    await context.connection.query
      .insertInto('products')
      .values({
        id: 'p1',
        code: 'P-1',
        name: 'Product',
        specification: null,
        unit: '件',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const row = await context.connection.query
      .selectFrom('products')
      .selectAll()
      .where('code', '=', 'P-1')
      .executeTakeFirstOrThrow();
    expect(row.name).toBe('Product');
  });

  it('drops every collection on down', async () => {
    await migration.down!({
      builder: context.connection.builder,
      query: context.connection.query,
      connection: context.connection,
    });
    await expect(
      context.connection.builder.hasCollection('products'),
    ).resolves.toBe(false);
    await expect(
      context.connection.builder.hasCollection('nonconformances'),
    ).resolves.toBe(false);
  });

  it('adds the handling round and review history, and reverses them', async () => {
    const { builder } = context.connection;
    await expect(builder.hasCollection('nonconformanceReviews')).resolves.toBe(
      true,
    );
    // Selecting the column proves the alter-collection half was applied.
    await expect(
      context.connection.query
        .selectFrom('nonconformances')
        .select('round')
        .limit(0)
        .execute(),
    ).resolves.toEqual([]);
    await expect(
      context.connection.query
        .selectFrom('qualityAttachments')
        .select('round')
        .limit(0)
        .execute(),
    ).resolves.toEqual([]);

    await roundMigration.down!({
      builder,
      query: context.connection.query,
      connection: context.connection,
    });
    await expect(builder.hasCollection('nonconformanceReviews')).resolves.toBe(
      false,
    );
    await expect(
      context.connection.query
        .selectFrom('nonconformances')
        .select('round')
        .limit(0)
        .execute(),
    ).rejects.toThrow();
  });
});

describe('quality seeds', () => {
  let context: QualityTestDatabase;

  beforeEach(async () => {
    context = await createQualityDatabase();
    await createIdentityTables(context.connection);
  });

  afterEach(async () => {
    await context.dispose();
  });

  async function runRoles(): Promise<void> {
    await rolesSeed.run({
      query: context.connection.query,
      connection: context.connection,
    });
  }

  async function runSample(): Promise<void> {
    await sampleSeed.run({
      query: context.connection.query,
      connection: context.connection,
    });
  }

  async function count(table: string): Promise<number> {
    const rows = await context.connection.query
      .selectFrom(table)
      .select('id')
      .execute();
    return rows.length;
  }

  it('keeps the login-page trial credentials aligned with the seed', () => {
    expect(TRIAL_PASSWORD).toBe(SEED_TRIAL_PASSWORD);
    expect(
      [...TRIAL_ACCOUNTS.map((account) => account.username)].sort(),
    ).toEqual(
      [
        TRIAL_USERS.supervisor.username,
        TRIAL_USERS.inspector.username,
        TRIAL_USERS.inspectorTwo.username,
        TRIAL_USERS.productionLead.username,
        TRIAL_USERS.productionLeadTwo.username,
      ].sort(),
    );
  });

  it('creates the three roles, their trial users and assignments once', async () => {
    await runRoles();
    await runRoles();

    expect(await count('user')).toBe(5);
    expect(await count('account')).toBe(5);
    expect(await count('authorizationPermissionSets')).toBe(3);
    expect(await count('authorizationPermissionSetAssignments')).toBe(5);

    const sets = await context.connection.query
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'title'])
      .execute();
    expect(sets.map((row) => row.key).sort()).toEqual([
      INSPECTOR_ROLE,
      PRODUCTION_LEAD_ROLE,
      QUALITY_SUPERVISOR_ROLE,
    ]);

    const assignments = await context.connection.query
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['subjectId', 'permissionSetKey'])
      .execute();
    expect(
      assignments.find((row) => row.subjectId === TRIAL_USERS.productionLead.id)
        ?.permissionSetKey,
    ).toBe(PRODUCTION_LEAD_ROLE);
  });

  it('creates the sample data set once and keeps it reproducible', async () => {
    await runRoles();
    await runSample();
    await runSample();

    expect(await count('products')).toBe(4);
    expect(await count('productionBatches')).toBe(8);
    expect(await count('inspectionTasks')).toBe(12);
    expect(await count('inspectionItems')).toBe(39);
    expect(await count('nonconformances')).toBe(5);

    const tasks = await context.connection.query
      .selectFrom('inspectionTasks')
      .selectAll()
      .execute();
    expect(tasks.filter((task) => task.status === 'submitted')).toHaveLength(6);
    expect(tasks.filter((task) => task.result === 'unqualified')).toHaveLength(
      3,
    );
    expect(tasks.filter((task) => task.status === 'pending')).toHaveLength(4);
    expect(tasks.filter((task) => task.status === 'in_progress')).toHaveLength(
      2,
    );

    const rows = await context.connection.query
      .selectFrom('nonconformances')
      .select('status')
      .execute();
    expect(new Set(rows.map((row) => row.status)).size).toBe(5);

    // The sample data references the trial accounts by their fixed ids.
    const assigned = await context.connection.query
      .selectFrom('nonconformances')
      .select('assignedToId')
      .execute();
    expect(
      assigned.every(
        (row) => row.assignedToId === TRIAL_USERS.productionLead.id,
      ),
    ).toBe(true);
  });

  it('rejects a second rectification for the same task and item', async () => {
    await runRoles();
    await runSample();

    const existing = await context.connection.query
      .selectFrom('nonconformances')
      .selectAll()
      .limit(1)
      .executeTakeFirstOrThrow();

    await expect(
      context.connection.query
        .insertInto('nonconformances')
        .values({
          ...existing,
          id: 'duplicate-nc',
          code: 'NC-DUPLICATE',
        })
        .execute(),
    ).rejects.toThrow();
  });
});

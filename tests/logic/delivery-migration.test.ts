import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  type DatabaseManager,
  type MigrationContext,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609190001_create_delivery_tables.js';

const TABLES = [
  'delivery_projects',
  'delivery_project_members',
  'delivery_milestones',
  'delivery_tasks',
  'delivery_task_results',
  'delivery_task_result_versions',
  'delivery_task_result_version_files',
  'delivery_materials',
  'delivery_material_files',
  'delivery_submissions',
  'delivery_submission_items',
  'delivery_submission_comments',
  'delivery_files',
] as const;

interface SchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
  };
}

describe('delivery schema migration', () => {
  let database: DatabaseManager;

  beforeEach(() => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: {
        main: { dialect: 'sqlite', filename: ':memory:' },
      },
    });
  });

  afterEach(async () => {
    await database.destroy();
  });

  function context(): MigrationContext {
    const connection = database.connection();
    return {
      builder: database.builder(),
      query: connection.query,
      connection,
    } as unknown as MigrationContext;
  }

  it('creates every table, column and unique key the feature needs', async () => {
    await migration.up(context());
    const client = await database.connection().client<SchemaClient>();

    for (const table of TABLES) {
      await expect(client.schema.hasTable(table)).resolves.toBe(true);
    }
    for (const column of [
      'code',
      'name',
      'manager_id',
      'start_date',
      'end_date',
      'status',
      'description',
    ]) {
      await expect(
        client.schema.hasColumn('delivery_projects', column),
      ).resolves.toBe(true);
    }
    for (const column of [
      'milestone_id',
      'project_id',
      'title',
      'assignee_id',
      'priority',
      'plan_date',
      'actual_date',
      'status',
    ]) {
      await expect(
        client.schema.hasColumn('delivery_tasks', column),
      ).resolves.toBe(true);
    }
    for (const column of [
      'milestone_id',
      'applicant_id',
      'reviewer_id',
      'status',
      'previous_submission_id',
      'round',
    ]) {
      await expect(
        client.schema.hasColumn('delivery_submissions', column),
      ).resolves.toBe(true);
    }
    for (const column of [
      'id',
      'disk',
      'key',
      'filename',
      'ext',
      'mime_type',
      'size',
      'created_at',
      'updated_at',
    ]) {
      await expect(
        client.schema.hasColumn('delivery_files', column),
      ).resolves.toBe(true);
    }
  });

  it('enforces unique project codes and version numbers', async () => {
    await migration.up(context());
    const query = database.connection().query;
    const now = new Date();
    await query
      .insertInto('deliveryProjects')
      .values({
        code: 'P-1',
        name: 'One',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await expect(
      query
        .insertInto('deliveryProjects')
        .values({
          code: 'P-1',
          name: 'Duplicate',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        .execute(),
    ).rejects.toThrow();

    await query
      .insertInto('deliveryTaskResults')
      .values({ taskId: 1, title: 'Result', createdAt: now, updatedAt: now })
      .execute();
    await query
      .insertInto('deliveryTaskResultVersions')
      .values({ resultId: 1, versionNo: 1, createdAt: now, updatedAt: now })
      .execute();
    await expect(
      query
        .insertInto('deliveryTaskResultVersions')
        .values({ resultId: 1, versionNo: 1, createdAt: now, updatedAt: now })
        .execute(),
    ).rejects.toThrow();
  });

  it('drops every table in down', async () => {
    await migration.up(context());
    await migration.down!(context());
    const client = await database.connection().client<SchemaClient>();
    for (const table of TABLES) {
      await expect(client.schema.hasTable(table)).resolves.toBe(false);
    }
  });
});

// @vitest-environment node
import path from 'node:path';

import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import recruitmentSeed from '../../database/main/seeds/202609190001_seed_recruitment_demo_data.js';
import { createRecruitmentTestContext } from '../fixtures/recruitment-harness.js';

interface SchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
  };
}

describe('recruitment schema migration', () => {
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

  async function migrator() {
    return createMigrator({
      database,
      packageName: 'test-application',
      directory: path.resolve('database/main/migrations'),
    });
  }

  it('creates every recruitment table, column and index, and reverses them', async () => {
    const runner = await migrator();
    const result = await runner.latest();
    expect(result.executed).toContain('202609190001_create_recruitment_tables');

    const connection = database.connection();
    const client = await connection.client<SchemaClient>();
    await expect(client.schema.hasTable('recruitment_positions')).resolves.toBe(
      true,
    );
    await expect(
      client.schema.hasTable('recruitment_candidates'),
    ).resolves.toBe(true);
    await expect(
      client.schema.hasTable('recruitment_interviews'),
    ).resolves.toBe(true);
    await expect(
      client.schema.hasTable('recruitment_onboarding_todos'),
    ).resolves.toBe(true);

    for (const [table, columns] of [
      [
        'recruitment_positions',
        ['title', 'department', 'headcount', 'owner_username', 'status'],
      ],
      [
        'recruitment_candidates',
        [
          'name',
          'position_id',
          'recruiter_username',
          'stage',
          'hire_confirmed_by',
        ],
      ],
      [
        'recruitment_interviews',
        [
          'candidate_id',
          'interviewer_username',
          'scheduled_at',
          'status',
          'score',
          'evaluation',
        ],
      ],
      ['recruitment_onboarding_todos', ['candidate_id', 'title', 'status']],
    ] as const) {
      for (const column of columns) {
        await expect(client.schema.hasColumn(table, column)).resolves.toBe(
          true,
        );
      }
    }

    // A fresh migrator must not re-run anything.
    await expect(runner.latest()).resolves.toMatchObject({ executed: [] });

    await runner.rollback();
    await expect(client.schema.hasTable('recruitment_positions')).resolves.toBe(
      false,
    );
    await expect(
      client.schema.hasTable('recruitment_onboarding_todos'),
    ).resolves.toBe(false);
  });
});

describe('recruitment demo seed', () => {
  let context: Awaited<ReturnType<typeof createRecruitmentTestContext>>;

  beforeEach(async () => {
    context = await createRecruitmentTestContext();
  });

  afterEach(async () => {
    await context.destroy();
  });

  async function counts() {
    const query = context.database.connection().query;
    const count = async (table: string) => {
      const rows = await query.selectFrom(table).select('id').execute();
      return rows.length;
    };
    const recruitmentSets = await query
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .where('key', 'like', 'recruitment-%')
      .execute();
    const recruitmentAssignments = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('permissionSetKey', 'like', 'recruitment-%')
      .execute();
    return {
      users: await count('user'),
      positions: await count('recruitmentPositions'),
      candidates: await count('recruitmentCandidates'),
      interviews: await count('recruitmentInterviews'),
      todos: await count('recruitmentOnboardingTodos'),
      permissionSets: recruitmentSets.length,
      assignments: recruitmentAssignments.length,
    };
  }

  it('creates the documented demo data with roles and page access', async () => {
    const state = await counts();
    expect(state.positions).toBe(4);
    expect(state.candidates).toBe(12);
    expect(state.interviews).toBe(8);
    expect(state.todos).toBe(5);
    // Five demo accounts plus the role-less account the harness adds.
    expect(state.users).toBe(6);
    expect(state.permissionSets).toBe(3);
    expect(state.assignments).toBe(5);

    const query = context.database.connection().query;
    const grantRows = await query
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'grants'])
      .execute();
    const grants = new Map(
      grantRows.map((row) => [String(row.key), String(row.grants)]),
    );
    expect(grants.get('recruitment-hr-manager')).toContain(
      'recruitment-candidates',
    );
    expect(grants.get('recruitment-recruiter')).toContain(
      'recruitment-positions',
    );
    expect(grants.get('recruitment-interviewer')).toContain(
      'recruitment-interviews',
    );
    expect(grants.get('recruitment-interviewer')).not.toContain(
      'recruitment-stats',
    );

    const assignments = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['subjectId', 'permissionSetKey'])
      .execute();
    const bySet = assignments.map((row) => String(row.permissionSetKey));
    expect(bySet.filter((key) => key === 'recruitment-recruiter')).toHaveLength(
      2,
    );
    expect(
      bySet.filter((key) => key === 'recruitment-interviewer'),
    ).toHaveLength(2);
    expect(
      bySet.filter((key) => key === 'recruitment-hr-manager'),
    ).toHaveLength(1);

    const recruiter = await query
      .selectFrom('recruitmentCandidates')
      .select(['id', 'recruiterUsername'])
      .where('recruiterUsername', '=', 'recruiter.li')
      .execute();
    expect(recruiter).toHaveLength(6);
  });

  it('is idempotent: running it again changes nothing', async () => {
    const before = await counts();
    await recruitmentSeed.run({
      query: context.database.connection().query,
      connection: context.database.connection(),
    });
    const after = await counts();
    expect(after).toEqual(before);
  });
});

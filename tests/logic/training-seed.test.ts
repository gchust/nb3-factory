import { createAuthorization } from '@nocobase/authorization/core';
import { pages } from '@nocobase/authorization/pages';
import { permissionSets } from '@nocobase/authorization/permissions';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import type { MigrationContext } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { verifyPassword } from 'better-auth/crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202609190001_create_training_tables.js';
import fileMigration from '../../database/main/migrations/202609190003_create_training_files.js';
import seed from '../../database/main/seeds/202609190002_seed_training_demo.js';

async function count(
  database: DatabaseManager,
  table: string,
): Promise<number> {
  const rows = await database
    .connection()
    .query.selectFrom(table)
    .select(({ fn }) => [fn.countAll().as('count')])
    .execute();
  return Number(rows[0]?.count ?? 0);
}

describe('training demo seed', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = createDatabaseManager({
      drivers: { sqlite },
      default: 'main',
      connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
    });
    await applyTrainingSchema(database);
    await createIdentityTables(database);
  });

  afterEach(async () => {
    await database.destroy();
  });

  async function runSeed(): Promise<void> {
    const connection = database.connection();
    await seed.run({ query: connection.query, connection });
  }

  it('creates role accounts that sign in with the documented password', async () => {
    await runSeed();

    expect(await count(database, 'user')).toBe(9);
    expect(await count(database, 'trainingCourses')).toBe(3);
    expect(await count(database, 'trainingSessions')).toBe(4);
    expect(await count(database, 'trainingEnrollments')).toBe(12);
    expect(await count(database, 'trainingAssignments')).toBe(12);
    expect(await count(database, 'trainingSubmissions')).toBe(22);
    expect(await count(database, 'trainingSubmissionReviews')).toBe(14);
    expect(await count(database, 'authorizationPermissionSets')).toBe(4);
    expect(await count(database, 'authorizationPermissionSetAssignments')).toBe(
      10,
    );

    const account = await database
      .connection()
      .query.selectFrom('account')
      .select(['password'])
      .where('accountId', '=', 'demo-admin')
      .executeTakeFirstOrThrow();
    await expect(
      verifyPassword({
        hash: String(account.password),
        password: 'Train@2026',
      }),
    ).resolves.toBe(true);
  });

  it('grants each role the page access its routes require', async () => {
    await runSeed();

    const grantsFor = async (key: string): Promise<readonly string[]> => {
      const row = await database
        .connection()
        .query.selectFrom('authorizationPermissionSets')
        .select(['grants'])
        .where('key', '=', key)
        .executeTakeFirstOrThrow();
      const grants = JSON.parse(String(row.grants)) as {
        resource: { type: string; id: string };
        actions: { action: string }[];
      }[];
      return grants
        .filter(
          (grant) =>
            grant.resource.type === 'page' &&
            grant.actions.some((action) => action.action === 'access'),
        )
        .map((grant) => grant.resource.id)
        .sort();
    };

    // A role without these page grants signs in but is denied every page, so
    // the guarded client routes must each appear in the matching role.
    expect(await grantsFor('training-admin')).toEqual(
      [
        'trainingAssignmentDetail',
        'trainingCatalog',
        'trainingGrading',
        'trainingManage',
        'trainingMyLearning',
        'trainingSessionDetail',
        'trainingStats',
      ].sort(),
    );
    expect(await grantsFor('training-instructor')).toEqual(
      [
        'trainingAssignmentDetail',
        'trainingCatalog',
        'trainingGrading',
        'trainingMyLearning',
        'trainingSessionDetail',
        'trainingStats',
      ].sort(),
    );
    expect(await grantsFor('training-student')).toEqual(
      [
        'trainingAssignmentDetail',
        'trainingCatalog',
        'trainingMyLearning',
        'trainingSessionDetail',
      ].sort(),
    );
    // The signed-in audience default carries the same read-only pages.
    expect(await grantsFor('training-learner')).toEqual(
      [
        'trainingAssignmentDetail',
        'trainingCatalog',
        'trainingMyLearning',
        'trainingSessionDetail',
      ].sort(),
    );
    // A student must not be able to open the instructor or admin surfaces.
    expect(await grantsFor('training-student')).not.toContain(
      'trainingGrading',
    );
    expect(await grantsFor('training-student')).not.toContain('trainingManage');
    expect(await grantsFor('training-instructor')).not.toContain(
      'trainingManage',
    );
  });

  it('lets each demo role open exactly the pages it owns', async () => {
    await runSeed();

    // Run the seeded grants through the real authorization stack so the test
    // fails if the stored shape ever stops matching what the pages plugin
    // resolves. This is the check that a signed-in demo account actually
    // passes on the client before a page component is allowed to load.
    const canAccess = async (
      userId: string,
      pageId: string,
    ): Promise<boolean> => {
      const authz = createAuthorization({
        connection: database.connection(),
        plugins: [permissionSets(), pages()],
      });
      const scope = authz.for({
        principal: { type: 'user', id: userId },
        subjects: [{ type: 'authenticated', id: '*' }],
      });
      return scope.can({
        resource: { type: 'page', id: pageId },
        action: 'access',
      });
    };

    await expect(canAccess('demo-admin', 'trainingManage')).resolves.toBe(true);
    await expect(canAccess('demo-admin', 'trainingCatalog')).resolves.toBe(
      true,
    );

    await expect(
      canAccess('demo-instructor-li', 'trainingGrading'),
    ).resolves.toBe(true);
    await expect(
      canAccess('demo-instructor-li', 'trainingManage'),
    ).resolves.toBe(false);
    await expect(
      canAccess('demo-instructor-li', 'trainingMyLearning'),
    ).resolves.toBe(true);

    await expect(
      canAccess('demo-student-zhao', 'trainingMyLearning'),
    ).resolves.toBe(true);
    await expect(
      canAccess('demo-student-zhao', 'trainingCatalog'),
    ).resolves.toBe(true);
    await expect(
      canAccess('demo-student-zhao', 'trainingAssignmentDetail'),
    ).resolves.toBe(true);
    await expect(
      canAccess('demo-student-zhao', 'trainingGrading'),
    ).resolves.toBe(false);
    await expect(canAccess('demo-student-zhao', 'trainingStats')).resolves.toBe(
      false,
    );
    await expect(
      canAccess('demo-student-zhao', 'trainingManage'),
    ).resolves.toBe(false);

    // A user who has just signed up holds only the learner audience default:
    // they may browse the catalog and their own learning, but no management,
    // grading or statistics surface is opened to them.
    await expect(
      canAccess('freshly-registered-user', 'trainingMyLearning'),
    ).resolves.toBe(true);
    await expect(
      canAccess('freshly-registered-user', 'trainingCatalog'),
    ).resolves.toBe(true);
    await expect(
      canAccess('freshly-registered-user', 'trainingAssignmentDetail'),
    ).resolves.toBe(true);
    await expect(
      canAccess('freshly-registered-user', 'trainingGrading'),
    ).resolves.toBe(false);
    await expect(
      canAccess('freshly-registered-user', 'trainingStats'),
    ).resolves.toBe(false);
    await expect(
      canAccess('freshly-registered-user', 'trainingManage'),
    ).resolves.toBe(false);
  });

  it('repairs a role permission set that has no page grants yet', async () => {
    const connection = database.connection();
    await connection.query
      .insertInto('authorizationPermissionSets')
      .values({
        id: 'pre-existing-training-student',
        key: 'training-student',
        title: '学员',
        grants: JSON.stringify([]),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();

    await runSeed();

    const row = await connection.query
      .selectFrom('authorizationPermissionSets')
      .select(['grants'])
      .where('key', '=', 'training-student')
      .executeTakeFirstOrThrow();
    const grants = JSON.parse(String(row.grants)) as {
      resource: { type: string; id: string };
      actions: { action: string }[];
    }[];
    expect(
      grants.some(
        (grant) =>
          grant.resource.type === 'page' &&
          grant.resource.id === 'trainingMyLearning' &&
          grant.actions.some((action) => action.action === 'access'),
      ),
    ).toBe(true);

    // Re-running must not add a second copy of the same grant.
    await runSeed();
    const after = await connection.query
      .selectFrom('authorizationPermissionSets')
      .select(['grants'])
      .where('key', '=', 'training-student')
      .executeTakeFirstOrThrow();
    const pages = (
      JSON.parse(String(after.grants)) as {
        resource: { type: string; id: string };
      }[]
    ).filter((grant) => grant.resource.type === 'page');
    expect(new Set(pages.map((grant) => grant.resource.id)).size).toBe(
      pages.length,
    );
  });

  it('marks late work, keeps a returned round, and records each review', async () => {
    await runSeed();

    const late = await database
      .connection()
      .query.selectFrom('trainingSubmissions')
      .select(['studentId', 'attempt', 'isLate', 'status'])
      .where('studentId', '=', 'demo-student-qian')
      .where('assignmentId', '=', 2)
      .executeTakeFirstOrThrow();
    expect(Boolean(late.isLate)).toBe(true);
    expect(late.status).toBe('graded');

    const returned = await database
      .connection()
      .query.selectFrom('trainingSubmissions')
      .select(['id', 'attempt', 'status'])
      .where('studentId', '=', 'demo-student-sun')
      .where('assignmentId', '=', 1)
      .where('attempt', '=', 1)
      .executeTakeFirstOrThrow();
    expect(returned.status).toBe('returned');

    const resubmitted = await database
      .connection()
      .query.selectFrom('trainingSubmissions')
      .select(['status'])
      .where('studentId', '=', 'demo-student-sun')
      .where('assignmentId', '=', 1)
      .where('attempt', '=', 2)
      .executeTakeFirstOrThrow();
    expect(resubmitted.status).toBe('submitted');

    const reviews = await database
      .connection()
      .query.selectFrom('trainingSubmissionReviews')
      .selectAll()
      .where('submissionId', '=', Number(returned.id))
      .execute();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.decision).toBe('returned');
  });

  it('records demo courseware, homework and annotation files', async () => {
    await runSeed();

    const files = await database
      .connection()
      .query.selectFrom('trainingFiles')
      .selectAll()
      .execute();
    expect(files).toHaveLength(9);
    for (const file of files) {
      // The key points at the object the application writes through whatever
      // disk the drive is configured with; the seed only owns the row.
      expect(String(file.disk)).toBe('local');
      expect(String(file.key)).toBe(
        `objects/${String(file.id)}.${String(file.ext)}`,
      );
      expect(Number(file.size)).toBeGreaterThan(0);
    }
    expect(files.filter((file) => file.ext === 'png')).toHaveLength(2);
    expect(files.filter((file) => file.ext === 'pdf')).toHaveLength(4);
    expect(files.filter((file) => file.ext === 'txt')).toHaveLength(2);

    // Four courseware rows on the first session, two homework versions for the
    // returned round and one graded report, plus one annotation per review.
    expect(await count(database, 'trainingMaterials')).toBe(4);
    expect(await count(database, 'trainingSubmissionFiles')).toBe(3);
    expect(await count(database, 'trainingReviewFiles')).toBe(2);

    const grouped = await database
      .connection()
      .query.selectFrom('trainingSubmissionFiles')
      .select(['submissionId', 'fileId'])
      .execute();
    const submissionIds = new Set(
      grouped.map((row) => Number(row.submissionId)),
    );
    // The returned attempt and its resubmission are separate submissions, so
    // the two homework versions never share a row.
    expect(submissionIds.size).toBe(3);
  });

  it('does not duplicate data when run twice', async () => {
    await runSeed();
    const before = {
      users: await count(database, 'user'),
      submissions: await count(database, 'trainingSubmissions'),
      reviews: await count(database, 'trainingSubmissionReviews'),
      files: await count(database, 'trainingFiles'),
      materials: await count(database, 'trainingMaterials'),
      assignments: await count(
        database,
        'authorizationPermissionSetAssignments',
      ),
    };

    await runSeed();

    expect(await count(database, 'user')).toBe(before.users);
    expect(await count(database, 'trainingSubmissions')).toBe(
      before.submissions,
    );
    expect(await count(database, 'trainingSubmissionReviews')).toBe(
      before.reviews,
    );
    expect(await count(database, 'trainingFiles')).toBe(before.files);
    expect(await count(database, 'trainingMaterials')).toBe(before.materials);
    expect(await count(database, 'authorizationPermissionSetAssignments')).toBe(
      before.assignments,
    );
  });
});

async function applyTrainingSchema(database: DatabaseManager): Promise<void> {
  const connection = database.connection();
  const context: MigrationContext = {
    builder: connection.builder,
    query: connection.query,
    connection: {
      name: connection.name,
      driver: connection.driver,
      dialect: connection.dialect,
      capabilities: connection.capabilities,
      client: connection.client.bind(connection),
    },
  };
  await migration.up(context);
  await fileMigration.up(context);
}

async function createIdentityTables(database: DatabaseManager): Promise<void> {
  const { builder } = database.connection();
  await builder.createCollection('user', (collection) => {
    collection.string('id', { length: 64 }).notNull().primary();
    collection.string('name', { length: 255 }).notNull();
    collection.string('username', { length: 255 }).nullable();
    collection.string('email', { length: 320 }).notNull();
    collection.boolean('emailVerified').notNull().defaultTo(false);
    collection.text('image').nullable();
    collection.datetime('disabledAt').nullable();
    collection.datetime('deletedAt').nullable();
    collection.string('deletedBy', { length: 64 }).nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
  });
  await builder.createCollection('account', (collection) => {
    collection.string('id', { length: 64 }).notNull().primary();
    collection.string('issuer', { length: 255 }).notNull();
    collection.string('accountId', { length: 320 }).notNull();
    collection.string('providerId', { length: 128 }).notNull();
    collection.string('userId', { length: 64 }).notNull();
    collection.text('accessToken').nullable();
    collection.text('refreshToken').nullable();
    collection.text('idToken').nullable();
    collection.datetime('accessTokenExpiresAt').nullable();
    collection.datetime('refreshTokenExpiresAt').nullable();
    collection.text('scope').nullable();
    collection.text('password').nullable();
    collection.datetime('createdAt').notNull();
    collection.datetime('updatedAt').notNull();
    collection.unique(['issuer', 'accountId'], {
      name: 'uq_account_issuer_account',
    });
  });
  await builder.createCollection(
    'authorizationPermissionSets',
    (collection) => {
      collection.string('id', { length: 64 }).notNull().primary();
      collection.string('key', { length: 255 }).notNull().unique();
      collection.string('title', { length: 255 }).nullable();
      collection.json('grants').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    },
  );
  await builder.createCollection(
    'authorizationPermissionSetAssignments',
    (collection) => {
      collection.string('id', { length: 255 }).notNull().primary();
      collection.string('subjectType', { length: 64 }).notNull();
      collection.string('subjectId', { length: 255 }).notNull();
      collection.string('permissionSetKey', { length: 255 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique(['subjectType', 'subjectId', 'permissionSetKey'], {
        name: 'uq_authorization_permission_set_assignments_subject_set',
      });
    },
  );
}

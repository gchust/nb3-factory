import path from 'node:path';

import { createAppAuthorization } from '@nocobase/app-plugin-authorization';
import sqlite from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
  createMigrator,
  type DatabaseManager,
} from '@nocobase/db';

import recruitmentSeed from '../../database/main/seeds/202609190001_seed_recruitment_demo_data.js';
import {
  createRecruitmentService,
  type Actor,
  type RecruitmentService,
} from '../../server/providers/recruitment.js';

/**
 * A real SQLite database with the authentication and authorization plugin
 * tables, this application's recruitment migration, and the demo seed. Tests
 * exercise the service and routes against it instead of mocking the database.
 */
export interface RecruitmentTestContext {
  readonly database: DatabaseManager;
  readonly service: RecruitmentService;
  readonly authorization: ReturnType<typeof createAppAuthorization>;
  readonly actorByUsername: Readonly<Record<string, Actor>>;
  readonly plainUserId: string;
  destroy(): Promise<void>;
}

export async function createRecruitmentTestContext(): Promise<RecruitmentTestContext> {
  const database = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: ':memory:' },
    },
  });
  await migratePackage(database, '@nocobase/app-plugin-authentication');
  await migratePackage(database, '@nocobase/app-plugin-authorization');
  await createMigrator({
    database,
    packageName: 'test-application',
    directory: path.resolve('database/main/migrations'),
  }).latest();

  const authorization = createAppAuthorization({
    connection: database.connection(),
  });
  await recruitmentSeed.run({
    query: database.connection().query,
    connection: database.connection(),
  });

  const service = createRecruitmentService({ database, authorization });

  // An account with no recruitment role, to prove the server rejects it.
  const now = new Date();
  const plainUserId = crypto.randomUUID();
  await database
    .connection()
    .query.insertInto('user')
    .values({
      id: plainUserId,
      name: '外部账号',
      username: 'outsider',
      email: 'outsider@example.com',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  const actorByUsername: Record<string, Actor> = {};
  for (const username of [
    'hr.manager',
    'recruiter.li',
    'recruiter.wang',
    'interviewer.zhang',
    'interviewer.chen',
  ]) {
    const user = await database
      .connection()
      .query.selectFrom('user')
      .select('id')
      .where('username', '=', username)
      .executeTakeFirstOrThrow();
    actorByUsername[username] = await service.resolveActor(String(user.id));
  }

  return {
    database,
    service,
    authorization,
    actorByUsername,
    plainUserId,
    destroy: () => database.destroy(),
  };
}

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

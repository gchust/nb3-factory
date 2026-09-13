import {
  createDatabaseManager,
  type DatabaseManager,
  type MigrationContext,
} from '@nocobase/db';

import createDepartments from '../../database/main/migrations/202609130001_create_hr_departments.js';
import createEmployees from '../../database/main/migrations/202609130002_create_hr_employees.js';
import createLeaveRequests from '../../database/main/migrations/202609130003_create_hr_leave_requests.js';
import createOvertimeRequests from '../../database/main/migrations/202609130004_create_hr_overtime_requests.js';
import createAttachments from '../../database/main/migrations/202609130005_create_hr_attachments.js';

export const HR_MIGRATIONS = [
  createDepartments,
  createEmployees,
  createLeaveRequests,
  createOvertimeRequests,
  createAttachments,
];

/** In-memory SQLite with the HR schema applied by the real migrations. */
export async function createHrTestDatabase(): Promise<DatabaseManager> {
  const database = createDatabaseManager({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: ':memory:',
        schemaManagement: 'managed',
      },
    },
  });
  await database.connect();

  const context = {
    builder: database.builder(),
    query: database.query(),
    connection: database.connection(),
  } as unknown as MigrationContext;

  for (const migration of HR_MIGRATIONS) {
    await migration.up(context);
  }

  // The Authorization plugin owns this table in a real application; the role
  // resolver reads it, so the tests create the same shape to exercise scoping.
  await database
    .builder()
    .createCollection('authorizationPermissionSetAssignments', (collection) => {
      collection.increments('id');
      collection.string('subjectType', { length: 64, nullable: false });
      collection.string('subjectId', { length: 255, nullable: false });
      collection.string('permissionSetKey', { length: 255, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });

  return database;
}

export function migrationContext(database: DatabaseManager): MigrationContext {
  return {
    builder: database.builder(),
    query: database.query(),
    connection: database.connection(),
  } as unknown as MigrationContext;
}

export async function assignRole(
  database: DatabaseManager,
  subjectType: string,
  subjectId: string,
  permissionSetKey: string,
): Promise<void> {
  const now = new Date();
  await database
    .query()
    .insertInto('authorizationPermissionSetAssignments')
    .values({
      subjectType,
      subjectId,
      permissionSetKey,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

export async function linkUser(
  database: DatabaseManager,
  employeeId: number,
  userId: string,
): Promise<void> {
  await database
    .query()
    .updateTable('hrEmployees')
    .set({ userId })
    .where('id', '=', employeeId)
    .execute();
}

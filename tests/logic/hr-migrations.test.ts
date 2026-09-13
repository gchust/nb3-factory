import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseManager } from '@nocobase/db';

import {
  HR_MIGRATIONS,
  createHrTestDatabase,
  migrationContext,
} from './hr-test-database.js';

describe('HR migrations', () => {
  let database: DatabaseManager | undefined;

  afterEach(async () => {
    await database?.destroy();
    database = undefined;
  });

  it('creates every HR collection with the expected columns', async () => {
    database = await createHrTestDatabase();
    const builder = database.builder();

    await expect(builder.hasCollection('hrDepartments')).resolves.toBe(true);
    await expect(builder.hasCollection('hrEmployees')).resolves.toBe(true);
    await expect(builder.hasCollection('hrLeaveRequests')).resolves.toBe(true);
    await expect(builder.hasCollection('hrOvertimeRequests')).resolves.toBe(
      true,
    );
    await expect(builder.hasCollection('hrAttachments')).resolves.toBe(true);

    const now = new Date();
    await database
      .query()
      .insertInto('hrDepartments')
      .values({
        name: 'Engineering',
        managerName: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await database
      .query()
      .insertInto('hrEmployees')
      .values({
        name: 'Zhang Wei',
        employeeNo: 'E1',
        status: 'active',
        annualLeaveDays: 10,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await database
      .query()
      .insertInto('hrLeaveRequests')
      .values({
        employeeId: 1,
        type: 'annual',
        startDate: '2026-09-01',
        endDate: '2026-09-03',
        days: 3,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const leave = await database
      .query()
      .selectFrom('hrLeaveRequests')
      .selectAll()
      .executeTakeFirst();
    expect(leave?.days).toBe(3);
  });

  it('enforces the unique employee number', async () => {
    database = await createHrTestDatabase();
    const now = new Date();
    const insert = (employeeNo: string) =>
      database
        ?.query()
        .insertInto('hrEmployees')
        .values({
          name: 'Duplicate',
          employeeNo,
          status: 'active',
          annualLeaveDays: 0,
          createdAt: now,
          updatedAt: now,
        })
        .execute();

    await insert('E1');
    await expect(insert('E1')).rejects.toThrow();
  });

  it('reverses every migration on down', async () => {
    database = await createHrTestDatabase();
    const context = migrationContext(database);
    for (const migration of [...HR_MIGRATIONS].reverse()) {
      await migration.down?.(context);
    }
    const builder = database.builder();
    await expect(builder.hasCollection('hrEmployees')).resolves.toBe(false);
    await expect(builder.hasCollection('hrLeaveRequests')).resolves.toBe(false);
    await expect(builder.hasCollection('hrOvertimeRequests')).resolves.toBe(
      false,
    );
    await expect(builder.hasCollection('hrDepartments')).resolves.toBe(false);
    await expect(builder.hasCollection('hrAttachments')).resolves.toBe(false);
  });
});

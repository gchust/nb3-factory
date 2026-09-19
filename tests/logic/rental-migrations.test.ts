// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseManager } from '@nocobase/db';

import permissionSeed from '../../database/main/seeds/202609190010_seed_rental_permissions.js';
import demoSeed from '../../database/main/seeds/202609190011_seed_rental_demo_data.js';
import {
  MIGRATIONS_DIR,
  createRentalTestDatabase,
  migrateApp,
  migratePackage,
} from '../fixtures/rental-database.js';

describe('rental migrations', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = await createRentalTestDatabase();
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('creates the venue, tenant, booking and attachment tables with the expected columns', async () => {
    const client = await database.connection().client<SchemaClient>();

    for (const table of [
      'rental_venues',
      'rental_tenants',
      'rental_bookings',
      'rental_files',
      'rental_attachments',
    ]) {
      expect(await client.schema.hasTable(table)).toBe(true);
    }

    for (const column of [
      'disk',
      'key',
      'filename',
      'ext',
      'mime_type',
      'size',
      'created_at',
      'updated_at',
    ]) {
      expect(await client.schema.hasColumn('rental_files', column)).toBe(true);
    }
    for (const column of [
      'booking_id',
      'venue_id',
      'kind',
      'file_id',
      'sort',
    ]) {
      expect(await client.schema.hasColumn('rental_attachments', column)).toBe(
        true,
      );
    }

    for (const column of [
      'name',
      'location',
      'capacity',
      'unit_price',
      'status',
    ]) {
      expect(await client.schema.hasColumn('rental_venues', column)).toBe(true);
    }
    for (const column of [
      'reference',
      'venue_id',
      'tenant_id',
      'owner_id',
      'start_at',
      'end_at',
      'fee',
      'status',
      'delivery_condition',
      'return_condition',
      'damage_note',
      'damage_fee',
      'confirmed_at',
      'settled_at',
      'cancel_reason',
    ]) {
      expect(await client.schema.hasColumn('rental_bookings', column)).toBe(
        true,
      );
    }
  });

  it('reverses all migrations on rollback', async () => {
    const client = await database.connection().client<SchemaClient>();
    const migration = database.createMigrator({
      packageName: 'app',
      directory: MIGRATIONS_DIR,
    });

    await migration.rollback();

    for (const table of [
      'rental_venues',
      'rental_tenants',
      'rental_bookings',
      'rental_attachments',
      'rental_files',
    ]) {
      expect(await client.schema.hasTable(table)).toBe(false);
    }
  });

  it('reapplies cleanly after a rollback', async () => {
    const client = await database.connection().client<SchemaClient>();
    const migration = database.createMigrator({
      packageName: 'app',
      directory: MIGRATIONS_DIR,
    });
    await migration.rollback();
    for (const table of [
      'rental_venues',
      'rental_tenants',
      'rental_bookings',
      'rental_attachments',
      'rental_files',
    ]) {
      expect(await client.schema.hasTable(table)).toBe(false);
    }

    await migrateApp(database);
    for (const table of [
      'rental_venues',
      'rental_tenants',
      'rental_bookings',
      'rental_attachments',
      'rental_files',
    ]) {
      expect(await client.schema.hasTable(table)).toBe(true);
    }
  });
});

describe('rental seeds', () => {
  let database: DatabaseManager;

  beforeEach(async () => {
    database = await createRentalTestDatabase();
  });

  afterEach(async () => {
    await database.destroy();
  });

  async function runDemoSeed(): Promise<void> {
    await demoSeed.run({
      query: database.query(),
      connection: database.connection() as never,
    });
  }

  it('is idempotent: a repeat run adds no duplicate rows', async () => {
    await runDemoSeed();
    await runDemoSeed();

    await expect(
      database
        .query()
        .selectFrom('rentalVenues')
        .select((eb) => [eb.fn.countAll().as('count')])
        .executeTakeFirst(),
    ).resolves.toMatchObject({ count: 6 });
    await expect(
      database
        .query()
        .selectFrom('rentalTenants')
        .select((eb) => [eb.fn.countAll().as('count')])
        .executeTakeFirst(),
    ).resolves.toMatchObject({ count: 8 });
    await expect(
      database
        .query()
        .selectFrom('rentalBookings')
        .select((eb) => [eb.fn.countAll().as('count')])
        .executeTakeFirst(),
    ).resolves.toMatchObject({ count: 12 });

    const statuses = await database
      .query()
      .selectFrom('rentalBookings')
      .select('status')
      .execute();
    const counts = new Map<string, number>();
    for (const row of statuses) {
      const key = String(row.status);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.get('pending')).toBe(3);
    expect(counts.get('confirmed')).toBe(3);
    expect(counts.get('delivered')).toBe(2);
    expect(counts.get('returned')).toBe(2);
    expect(counts.get('settled')).toBe(1);
    expect(counts.get('cancelled')).toBe(1);
  });

  it('registers rental roles and a default page grant once', async () => {
    await migratePackage(database, '@nocobase/app-plugin-authorization');
    const run = (): Promise<void> =>
      permissionSeed.run({
        query: database.query(),
        connection: database.connection() as never,
      });

    await run();
    await run();

    const sets = await database
      .query()
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .where('key', 'like', 'rental-%')
      .execute();
    expect(sets.map((row) => row.key).sort()).toEqual([
      'rental-manager',
      'rental-member',
      'rental-staff',
    ]);

    const assignments = await database
      .query()
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['subjectType', 'subjectId', 'permissionSetKey'])
      .where('permissionSetKey', 'like', 'rental-%')
      .execute();
    expect(assignments).toEqual([
      {
        subjectType: 'authenticated',
        subjectId: '*',
        permissionSetKey: 'rental-member',
      },
    ]);
  });
});

interface SchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
  };
}

// @vitest-environment node
import {
  createDatabaseManager,
  type MigrationContext,
  type SeedContext,
} from '@nocobase/db';
import { afterAll, describe, expect, it } from 'vitest';

import resourceFilesMigration from '../../database/main/migrations/202609130001_create_resource_files.js';
import resourcesMigration from '../../database/main/migrations/202609130002_create_resources.js';
import resourceCenterSeed from '../../database/main/seeds/202609130003_seed_resource_center.js';

interface SchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
  };
}

const database = createDatabaseManager({
  default: 'main',
  connections: {
    main: { dialect: 'sqlite', filename: ':memory:' },
  },
});

afterAll(async () => {
  await database.destroy();
});

async function migrate(
  up: readonly { up(context: MigrationContext): Promise<void> }[],
): Promise<void> {
  for (const migration of up) {
    await migration.up({
      builder: database.builder('main'),
      query: database.query('main'),
    } as unknown as MigrationContext);
  }
}

describe('resource centre schema', () => {
  it('creates the attachment and resource collections, then reverses them', async () => {
    await migrate([resourceFilesMigration, resourcesMigration]);

    const connection = await database.connect('main');
    const client = await connection.client<SchemaClient>();

    expect(await client.schema.hasTable('resource_files')).toBe(true);
    expect(await client.schema.hasColumn('resource_files', 'disk')).toBe(true);
    expect(await client.schema.hasColumn('resource_files', 'key')).toBe(true);
    expect(await client.schema.hasColumn('resource_files', 'size')).toBe(true);

    expect(await client.schema.hasTable('resources')).toBe(true);
    expect(await client.schema.hasColumn('resources', 'title')).toBe(true);
    expect(await client.schema.hasColumn('resources', 'category')).toBe(true);
    expect(await client.schema.hasColumn('resources', 'cover_file_id')).toBe(
      true,
    );
    expect(await client.schema.hasColumn('resources', 'document_file_id')).toBe(
      true,
    );

    await resourcesMigration.down?.({
      builder: database.builder('main'),
      query: database.query('main'),
    } as unknown as MigrationContext);
    await resourceFilesMigration.down?.({
      builder: database.builder('main'),
      query: database.query('main'),
    } as unknown as MigrationContext);

    expect(await client.schema.hasTable('resources')).toBe(false);
    expect(await client.schema.hasTable('resource_files')).toBe(false);
  });
});

describe('resource centre seed', () => {
  it('inserts the examples once and is harmless on a repeat run', async () => {
    await migrate([resourceFilesMigration, resourcesMigration]);
    const context = {
      query: database.query('main'),
      connection: await database.connection('main'),
    } as unknown as SeedContext;

    await resourceCenterSeed.run(context);
    const first = await database
      .query('main')
      .selectFrom('resources')
      .select('id')
      .execute();
    expect(first).toHaveLength(3);

    await resourceCenterSeed.run(context);
    const second = await database
      .query('main')
      .selectFrom('resources')
      .select('id')
      .execute();
    expect(second).toHaveLength(3);
  });
});

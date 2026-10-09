// @vitest-environment node
import { createAppTest } from '@nocobase/app-testing/server';
import type { MigrationContext } from '@nocobase/db';
import { expect } from 'vitest';

import materialFilesMigration from '../../database/main/migrations/202609050002_create_project_material_files.ts';
import materialsMigration from '../../database/main/migrations/202609050001_create_project_materials.ts';
import { createStandaloneServer } from '../../server/standalone.ts';

// A real application on its own database. Its migrations install the material schema at startup; this test rolls that
// schema back with the migrations' own `down`, then applies `up` again, so both directions run against a real database.
// Its databases are thrown away when the file finishes.
const test = createAppTest({
  createServer: createStandaloneServer,
  server: { env: { APP_PUBLIC_ORIGIN: 'http://localhost' } },
  config: {
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    hub: { host: { enabled: false } },
  },
});

test('creates the material schema and drops it again', async ({ testApp }) => {
  const connection = testApp.connection;
  const inspector = connection.schemaInspector;
  const context = {
    builder: connection.builder,
    query: connection.query,
  } as unknown as MigrationContext;

  // Installed by the migrations at startup: the `up` direction already ran.
  expect(
    await inspector.getPhysicalCollection({ tableName: 'project_materials' }),
  ).toBeDefined();
  expect(
    await inspector.getPhysicalCollection({
      tableName: 'project_material_files',
    }),
  ).toBeDefined();

  // The reverse order: an attachment row goes before the material it points at.
  await materialFilesMigration.down?.(context);
  await materialsMigration.down?.(context);

  expect(
    await inspector.getPhysicalCollection({
      tableName: 'project_material_files',
    }),
  ).toBeUndefined();
  expect(
    await inspector.getPhysicalCollection({ tableName: 'project_materials' }),
  ).toBeUndefined();

  // Forward again, in dependency order, and inspect what `up` actually built.
  await materialsMigration.up(context);
  await materialFilesMigration.up(context);

  const materials = await inspector.getPhysicalCollection({
    tableName: 'project_materials',
  });
  expect(materials?.columns.map((column) => column.columnName)).toEqual(
    expect.arrayContaining([
      'id',
      'title',
      'description',
      'created_by_id',
      'created_at',
      'updated_at',
    ]),
  );
  const title = materials?.columns.find(
    (column) => column.columnName === 'title',
  );
  expect(title?.nullable).toBe(false);
  const description = materials?.columns.find(
    (column) => column.columnName === 'description',
  );
  expect(description?.nullable).toBe(true);
  expect(materials?.indexes.map((index) => index.name)).toContain(
    'idx_project_materials_created_by',
  );

  const files = await inspector.getPhysicalCollection({
    tableName: 'project_material_files',
  });
  expect(files?.columns.map((column) => column.columnName)).toEqual(
    expect.arrayContaining([
      'id',
      'disk',
      'key',
      'filename',
      'ext',
      'mime_type',
      'size',
      'material_id',
      'created_by_id',
      'created_at',
      'updated_at',
    ]),
  );
  // A file exists before the material that links to it does, so the owning column is nullable.
  const materialId = files?.columns.find(
    (column) => column.columnName === 'material_id',
  );
  expect(materialId?.nullable).toBe(true);
  expect(files?.indexes.map((index) => index.name)).toEqual(
    expect.arrayContaining([
      'idx_project_material_files_created_by',
      'idx_project_material_files_material',
    ]),
  );
});

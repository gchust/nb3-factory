// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';

import type { DatabaseManager } from '@nocobase/db';
import type { PhysicalCollectionSchema } from '@nocobase/db';

import {
  createTestDatabase,
  MIGRATIONS_DIRECTORY,
  applyMigrations,
} from './equipment-support';

/**
 * The migrations are the only statement of the schema the application runs
 * against, and they are exercised against a real SQLite database rather than
 * by importing the files: only a real `up` and `down` show what the columns,
 * indexes and foreign key actually are.
 */
describe('equipment migrations', () => {
  let database: DatabaseManager | undefined;

  afterEach(async () => {
    await database?.destroy();
    database = undefined;
  });

  function openDatabase(): DatabaseManager {
    database = createTestDatabase();
    return database;
  }

  async function inspect(
    connection: DatabaseManager,
    tableName: string,
  ): Promise<PhysicalCollectionSchema | undefined> {
    return connection
      .connection()
      .schemaInspector.getPhysicalCollection({ tableName });
  }

  function columnNames(schema: PhysicalCollectionSchema): string[] {
    return schema.columns.map((column) => column.columnName);
  }

  it('creates the equipment and equipment_loans tables', async () => {
    const connection = openDatabase();
    await applyMigrations(connection);

    const equipment = await inspect(connection, 'equipment');
    expect(equipment).toBeDefined();
    expect(columnNames(equipment!)).toEqual([
      'id',
      'asset_code',
      'name',
      'category',
      'notes',
      'created_at',
    ]);

    const loans = await inspect(connection, 'equipment_loans');
    expect(loans).toBeDefined();
    expect(columnNames(loans!)).toEqual([
      'id',
      'equipment_id',
      'borrower',
      'purpose',
      'borrowed_at',
      'expected_return_at',
      'returned_at',
      'created_at',
    ]);
  });

  it('makes the required equipment columns NOT NULL and the optional ones nullable', async () => {
    const connection = openDatabase();
    await applyMigrations(connection);
    const equipment = (await inspect(connection, 'equipment'))!;
    const nullability = Object.fromEntries(
      equipment.columns.map((column) => [column.columnName, column.nullable]),
    );

    expect(nullability).toEqual({
      id: false,
      asset_code: false,
      name: false,
      category: true,
      notes: true,
      created_at: false,
    });
  });

  it('enforces a unique asset code', async () => {
    const connection = openDatabase();
    await applyMigrations(connection);
    const equipment = (await inspect(connection, 'equipment'))!;
    const unique = equipment.indexes.filter((index) => index.unique);

    expect(unique).toHaveLength(1);
    expect(unique[0]!.keys.map((key) => key.columnName)).toEqual([
      'asset_code',
    ]);
  });

  it('indexes the columns the loan queries filter on', async () => {
    const connection = openDatabase();
    await applyMigrations(connection);
    const loans = (await inspect(connection, 'equipment_loans'))!;
    const indexed = Object.fromEntries(
      loans.indexes.map((index) => [
        index.name,
        index.keys.map((key) => key.columnName),
      ]),
    );

    expect(indexed).toMatchObject({
      idx_equipment_loans_equipment_id: ['equipment_id'],
      idx_equipment_loans_returned_at: ['returned_at'],
      idx_equipment_loans_expected_return_at: ['expected_return_at'],
    });
  });

  it('ties each loan to its equipment and refuses to delete borrowed equipment', async () => {
    const connection = openDatabase();
    await applyMigrations(connection);
    const loans = (await inspect(connection, 'equipment_loans'))!;
    const foreignKey = loans.foreignKeys[0];

    expect(foreignKey).toMatchObject({
      columns: ['equipment_id'],
      referencedColumns: ['id'],
      onDelete: 'restrict',
      onUpdate: 'cascade',
    });
    expect(foreignKey!.referencedCollection.tableName).toBe('equipment');
  });

  it('reverses itself: rolling the batch back removes both tables', async () => {
    const connection = openDatabase();
    const migrator = connection.createMigrator({
      directory: MIGRATIONS_DIRECTORY,
      packageName: 'nb3-factory',
    });
    await migrator.latest();
    expect(await inspect(connection, 'equipment')).toBeDefined();

    await migrator.rollback();

    expect(await inspect(connection, 'equipment')).toBeUndefined();
    expect(await inspect(connection, 'equipment_loans')).toBeUndefined();
  });
});

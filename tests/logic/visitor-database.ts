// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
  type MigrationContext,
  type MigrationDefinition,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';
import { sqliteDriver } from '@nocobase/db-sqlite';
import { ServiceContainer } from '@nocobase/service-provider';

/**
 * A real SQLite database on a temporary file, the migration under test applied
 * to it, and contexts that run a migration or seed against it.
 *
 * The framework loads migration and seed files through a dynamic `import()`,
 * which Vitest does not transform for an absolute path outside its module
 * graph. Tests import the definition module directly and hand it the same
 * context the loader would build, so a migration is still exercised against a
 * database rather than mocked.
 */
export interface VisitorTestDatabase {
  readonly database: DatabaseManager;
  readonly directory: string;
  apply(definitions: readonly MigrationDefinition[]): Promise<void>;
  revert(definitions: readonly MigrationDefinition[]): Promise<void>;
  runSeed(definition: SeedDefinition): Promise<void>;
  close(): Promise<void>;
}

export async function createVisitorTestDatabase(): Promise<VisitorTestDatabase> {
  const directory = mkdtempSync(path.join(tmpdir(), 'visitors-test-'));
  const database = createDatabaseManager({
    default: 'main',
    connections: {
      main: {
        dialect: 'sqlite',
        filename: path.join(directory, 'visitors.sqlite'),
        schemaManagement: 'managed',
      },
    },
    drivers: { sqlite: sqliteDriver },
    metadataStore: new InMemoryCollectionMetadataStore(),
  });
  await database.connect('main');

  const container = new ServiceContainer();
  const config = { get: (): undefined => undefined };
  const connection = database.connection('main');
  // The repository method is generic; one cast in this test-only harness keeps
  // the context usable without inventing a factory for the loader's shape.
  const repository = ((collection: string) =>
    connection.repository(collection)) as MigrationContext['repository'];

  const contextOf = (): MigrationContext => ({
    config,
    container,
    builder: database.builder('main'),
    query: database.query('main'),
    repository,
    connection,
  });

  return {
    database,
    directory,
    async apply(definitions) {
      for (const definition of definitions) {
        await definition.up(contextOf());
      }
    },
    async revert(definitions) {
      for (const definition of [...definitions].reverse()) {
        await definition.down?.(contextOf());
      }
    },
    async runSeed(definition) {
      const seedContext: SeedContext = {
        config,
        container,
        repository,
        query: database.query('main'),
        connection,
      };
      await definition.run(seedContext);
    },
    async close() {
      await database.destroy();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

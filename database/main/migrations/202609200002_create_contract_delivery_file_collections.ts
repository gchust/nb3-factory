import { defineMigration, type MigrationDefinition } from '@nocobase/db';
import type { CollectionDefinitionBuilder } from '@nocobase/db';

/**
 * File Collections consumed by the registered `@nocobase/app-plugin-file`
 * repository routes.
 *
 * The plugin requires an exact column set (`id`, `disk`, `key`, `filename`,
 * `ext`, `mimeType`, `size`, `createdAt`, `updatedAt`) with a UUID primary key,
 * so every collection below spells it out rather than sharing a definition that
 * could drift after this migration has been applied.
 */
const FILE_COLLECTIONS = [
  'cdContractFiles',
  'cdDeliverableFiles',
  'cdPaymentFiles',
] as const;

function defineFileCollection(
  collection: CollectionDefinitionBuilder,
): CollectionDefinitionBuilder {
  collection.uuid('id').primary().notNull();
  collection.string('disk', { length: 255, nullable: false });
  collection.text('key', { nullable: false });
  collection.text('filename', { nullable: false });
  collection.string('ext', { length: 32, nullable: false });
  collection.string('mimeType', { length: 255, nullable: false });
  collection.integer('size', { nullable: false });
  // Server-stamped uploader identity; kept beside the file so a preview can
  // show who uploaded it without joining the business record.
  collection.string('uploadedById', { length: 64, nullable: true });
  collection.string('uploadedByName', { length: 120, nullable: true });
  collection.datetime('createdAt', { nullable: false });
  collection.datetime('updatedAt', { nullable: false });
  collection.index('uploadedById');
  return collection;
}

const migration: MigrationDefinition = defineMigration({
  name: '202609200002_create_contract_delivery_file_collections',

  async up({ builder }) {
    for (const name of FILE_COLLECTIONS) {
      await builder.createCollection(name, defineFileCollection);
    }
  },

  async down({ builder }) {
    for (const name of [...FILE_COLLECTIONS].reverse()) {
      await builder.dropCollection(name);
    }
  },
});

export default migration;

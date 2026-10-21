import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/** The internal document library: a title, a body, an owner and the two visibility flags. */
const migration: MigrationDefinition = defineMigration({
  name: '202612010001_create_documents',

  async up({ builder }) {
    await builder.createCollection('documents', (collection) => {
      collection.string('id', { length: 36, primaryKey: true, nullable: false });
      collection.string('title', { length: 200, nullable: false });
      collection.text('content', { nullable: false });
      collection.string('ownerId', { length: 64, nullable: false });
      collection.boolean('published', { nullable: false, defaultValue: false });
      collection.boolean('confidential', { nullable: false, defaultValue: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });

      collection.foreignKey('ownerId', {
        references: { collection: 'user', fields: ['id'] },
        name: 'fk_documents_owner',
        onDelete: 'restrict',
        onUpdate: 'cascade',
      });
      collection.index('ownerId', { name: 'ix_documents_owner_id' });
      collection.index(['published', 'confidential'], {
        name: 'ix_documents_visibility',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('documents');
  },
});

export default migration;

import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the library's `documents` table.
 *
 * A document is a title, a plain-text body, the user who owns it and two
 * independent flags. `published` says whether qualified colleagues may read it
 * at all; `confidential` says whether an ordinary reader must never see it, even
 * if an administrator shares that single record. Keeping them separate is what
 * lets the confidentiality restriction rule narrow a sharing rule: the first is
 * a grant's own condition, the second is a rule intersected after every grant.
 *
 * `ownerId` is indexed but deliberately not a foreign key: the document must
 * outlive nothing, but neither must a user deletion cascade into the library,
 * and the authorization layer already decides who may see what.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610150001_create_documents',

  async up({ builder }) {
    await builder.createCollection('documents', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 200 }).notNull();
      collection.text('body').notNull().defaultTo('');
      collection.string('ownerId', { length: 64 }).notNull();
      collection.boolean('published').notNull().defaultTo(false);
      collection.boolean('confidential').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_documents' });
      collection.index(['ownerId'], { name: 'ix_documents_owner' });
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

import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Laboratories and the membership table that decides which lab a signed-in user
 * belongs to and what role they hold there. This is the application's own
 * permission source: the NocoBase authorization sets describe *roles*, while
 * `lab_members` describes *which lab* the role applies to.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010001_create_laboratory_tables',

  async up({ builder }) {
    await builder.createCollection('laboratories', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64, nullable: false });
      collection.string('name', { length: 200, nullable: false });
      collection.string('building', { length: 200, nullable: true });
      collection.string('room', { length: 64, nullable: true });
      collection.text('description', { nullable: true });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'active',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('code');
      collection.index('status');
    });

    await builder.createCollection('lab_members', (collection) => {
      collection.increments('id');
      collection.integer('labId', { nullable: false });
      collection.string('userId', { length: 191, nullable: false });
      collection.string('role', { length: 32, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.unique(['labId', 'userId']);
      collection.index('userId');
      collection.foreignKey(['labId'], {
        references: { collection: 'laboratories', fields: ['id'] },
        onDelete: 'cascade',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('lab_members');
    await builder.dropCollection('laboratories');
  },
});

export default migration;

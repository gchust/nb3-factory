import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The IT ticket table: one row per internal support request.
 *
 * `submitterId` and `handlerId` hold `user.id` values (Better Auth issues UUID
 * strings) but are deliberately plain columns without a database-level foreign
 * key. The table stays readable on its own connection and the write path is
 * the only way rows are created, so the reference is maintained by the service
 * rather than by a constraint that would tie this migration to the
 * authentication plugin's schema.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609300001_create_it_tickets',
  async up({ builder }) {
    await builder.createCollection('itTickets', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      // 'computer' | 'account' | 'other', validated by the service.
      collection.string('category', { length: 32, nullable: false });
      collection.text('description').nullable();
      collection.string('submitterId', { length: 64, nullable: false });
      collection.string('handlerId', { length: 64 }).nullable();
      // 'pending' | 'in-progress' | 'completed', defaulted for every new row.
      collection
        .string('status', { length: 32, nullable: false })
        .defaultTo('pending');
      collection.text('resolutionNote').nullable();
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('submitterId', { name: 'idx_it_tickets_submitter' });
      collection.index('status', { name: 'idx_it_tickets_status' });
      collection.index('handlerId', { name: 'idx_it_tickets_handler' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('itTickets');
  },
});

export default migration;

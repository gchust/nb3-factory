import { defineMigration } from '@nocobase/db';

/**
 * IT repair tickets submitted by employees and handled by the IT team.
 *
 * Self-contained on purpose: every column, index and constraint is spelled out
 * here so an already-applied migration never changes meaning when the business
 * model evolves. `submitterId` is required and cascades with the account;
 * `handlerId` is optional and cleared when the handler account is removed.
 */
const migration = defineMigration({
  name: '202609290001_create_repair_tickets',
  async up({ builder }) {
    await builder.createCollection('repairTickets', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.string('category', { length: 32 }).notNull();
      collection.text('description').nullable();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection.text('resolution').nullable();
      collection.string('submitterId', { length: 64 }).notNull();
      collection.string('handlerId', { length: 64 }).nullable();
      collection.datetime('startedAt').nullable();
      collection.datetime('completedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_repair_tickets' });
      collection.index('submitterId', {
        name: 'idx_repair_tickets_submitter',
      });
      collection.index('handlerId', { name: 'idx_repair_tickets_handler' });
      collection.index('status', { name: 'idx_repair_tickets_status' });
      collection.foreignKey(['submitterId'], {
        name: 'fk_repair_tickets_submitter',
        references: { collection: 'user', fields: ['id'] },
        onDelete: 'cascade',
        onUpdate: 'cascade',
      });
      collection.foreignKey(['handlerId'], {
        name: 'fk_repair_tickets_handler',
        references: { collection: 'user', fields: ['id'] },
        onDelete: 'set null',
        onUpdate: 'cascade',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('repairTickets');
  },
});

export default migration;

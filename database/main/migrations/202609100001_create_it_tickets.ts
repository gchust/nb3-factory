import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * IT repair tickets: one row per employee-submitted repair request, carrying the
 * submitter (`requesterId`), the processor who took it (`handlerId`) and the
 * lifecycle state (`pending` -> `processing` -> `completed`).
 *
 * Self-contained on purpose: no collection definition or shared constant is
 * imported, so an already-applied history keeps meaning what it meant.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609100001_create_it_tickets',

  async up({ builder }) {
    await builder.createCollection('itTickets', (collection) => {
      collection.title('IT tickets');
      collection.description(
        'Employee IT repair requests and their processing state',
      );
      collection.increments('id');
      collection.string('title', { length: 200, nullable: false });
      // Stored keys: computer | account | other.
      collection.string('category', { length: 32, nullable: false });
      collection.text('description', { nullable: true });
      // Stored keys: pending | processing | completed.
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'pending',
      });
      // Submitter identity, from the authenticated session.
      collection.string('requesterId', { length: 64, nullable: false });
      // The processor who actually took the ticket; set on the first transition.
      collection.string('handlerId', { length: 64, nullable: true });
      // Required processing note, written when the ticket is completed.
      collection.text('resolution', { nullable: true });
      collection.datetime('startedAt', { nullable: true });
      collection.datetime('completedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });

      collection.index('status');
      collection.index('requesterId');
      collection.index('handlerId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('itTickets');
  },
});

export default migration;

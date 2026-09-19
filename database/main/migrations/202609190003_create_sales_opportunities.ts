import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Sales opportunities.
 *
 * Stage is one of: initial_contact | needs_confirmation | proposal |
 * negotiation | won | lost. A closed opportunity (`won`/`lost`) must carry a
 * `closeReason`; that rule is enforced by the service so the reason is never
 * silently missing.
 *
 * `ownerId` is denormalized from the owning customer so opportunity lists can
 * be scoped without a join; the service keeps it in sync when a manager
 * reassigns a customer.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190003_create_sales_opportunities',

  async up({ builder }) {
    await builder.createCollection('salesOpportunities', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('customerId', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection
        .decimal('amount', { precision: 14, scale: 2 })
        .notNull()
        .defaultTo(0);
      collection.date('expectedCloseDate').nullable();
      collection
        .string('stage', { length: 32 })
        .notNull()
        .defaultTo('initial_contact');
      collection.text('closeReason').nullable();
      collection.string('ownerId', { length: 64 }).nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('customerId');
      collection.index('ownerId');
      collection.index('stage');
      collection.index('name');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('salesOpportunities');
  },
});

export default migration;

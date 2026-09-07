import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Opportunities and the many-to-many join with contacts.
 *
 * Stage flow: new -> needs-confirmation -> proposal-quote -> negotiation ->
 * won | lost. `winProbability` follows the stage (10/30/60/80/100/0) and
 * `weightedAmount = expectedAmount * winProbability`. `approvalStatus` is
 * manager-editable. `isArchived` hides a won/lost opportunity from the active
 * pipeline while keeping it in history and win-rate statistics.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609070005_create_sales_opportunities',
  async up({ builder }) {
    await builder.createCollection('opportunities', (collection) => {
      collection.increments('id');
      collection.string('opportunityNo', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.integer('customerId').notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('stage', { length: 32 }).notNull().defaultTo('new');
      collection
        .decimal('expectedAmount', { precision: 14, scale: 2 })
        .notNull()
        .defaultTo(0);
      collection.integer('winProbability').notNull().defaultTo(10);
      collection
        .decimal('weightedAmount', { precision: 14, scale: 2 })
        .notNull()
        .defaultTo(0);
      collection.datetime('expectedCloseDate').nullable();
      collection
        .decimal('actualAmount', { precision: 14, scale: 2 })
        .nullable();
      collection.string('resultReason', { length: 255 }).nullable();
      collection
        .string('approvalStatus', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection.boolean('isArchived').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('opportunityNo', {
        name: 'uq_opportunities_opportunity_no',
      });
      collection.index('customerId', { name: 'idx_opportunities_customer' });
      collection.index('ownerId', { name: 'idx_opportunities_owner' });
      collection.index('stage', { name: 'idx_opportunities_stage' });
      collection.foreignKey('customerId', {
        name: 'fk_opportunities_customer',
        references: { collection: 'customers', fields: ['id'] },
        onDelete: 'restrict',
      });
      collection.foreignKey('ownerId', {
        name: 'fk_opportunities_owner',
        references: { collection: 'user', fields: ['id'] },
        onDelete: 'restrict',
      });
    });

    await builder.createCollection('opportunityContacts', (collection) => {
      collection.increments('id');
      collection.integer('opportunityId').notNull();
      collection.integer('contactId').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique(['opportunityId', 'contactId'], {
        name: 'uq_opportunity_contacts_pair',
      });
      collection.index('contactId', {
        name: 'idx_opportunity_contacts_contact',
      });
      collection.foreignKey('opportunityId', {
        name: 'fk_opportunity_contacts_opportunity',
        references: { collection: 'opportunities', fields: ['id'] },
        onDelete: 'cascade',
      });
      collection.foreignKey('contactId', {
        name: 'fk_opportunity_contacts_contact',
        references: { collection: 'contacts', fields: ['id'] },
        onDelete: 'cascade',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('opportunityContacts');
    await builder.dropCollection('opportunities');
  },
} satisfies MigrationDefinition);

export default migration;

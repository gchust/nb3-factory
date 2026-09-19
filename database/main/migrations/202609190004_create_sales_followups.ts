import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Follow-up records. A follow-up always belongs to a customer and may point at
 * one of that customer's opportunities. The service rejects an opportunity
 * that belongs to a different customer, so a communication record can never be
 * attached to another customer's deal.
 *
 * `occurredAt` is when the conversation happened; `nextFollowUpAt` is the
 * agreed next contact date and is what the list uses to tell an overdue
 * follow-up from an upcoming one.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190004_create_sales_followups',

  async up({ builder }) {
    await builder.createCollection('salesFollowUps', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('customerId', { length: 64 }).notNull();
      collection.string('opportunityId', { length: 64 }).nullable();
      // Channel: phone | wechat | email | meeting | visit | other
      collection.string('channel', { length: 32 }).notNull().defaultTo('phone');
      collection.text('content').notNull();
      collection.datetime('occurredAt').notNull();
      collection.date('nextFollowUpAt').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('customerId');
      collection.index('opportunityId');
      collection.index('nextFollowUpAt');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('salesFollowUps');
  },
});

export default migration;

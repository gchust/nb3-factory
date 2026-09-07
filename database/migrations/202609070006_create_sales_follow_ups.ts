import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Follow-up records and the idempotency table for the daily overdue
 * follow-up reminder workflow. `followUpReminders` records one row per
 * (followUp, remindDate) so a reminder is sent at most once per day even if
 * the daily job runs more than once or is re-triggered.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609070006_create_sales_follow_ups',
  async up({ builder }) {
    await builder.createCollection('followUps', (collection) => {
      collection.increments('id');
      collection.string('subject', { length: 255 }).notNull();
      collection.string('method', { length: 32 }).nullable();
      collection.datetime('followUpAt').notNull();
      collection.datetime('nextFollowUpAt').nullable();
      collection.text('content').nullable();
      collection.integer('customerId').nullable();
      collection.integer('opportunityId').nullable();
      collection.integer('contactId').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('ownerId', { name: 'idx_follow_ups_owner' });
      collection.index('nextFollowUpAt', { name: 'idx_follow_ups_next' });
      collection.index('opportunityId', { name: 'idx_follow_ups_opportunity' });
      collection.foreignKey('customerId', {
        name: 'fk_follow_ups_customer',
        references: { collection: 'customers', fields: ['id'] },
        onDelete: 'set null',
      });
      collection.foreignKey('opportunityId', {
        name: 'fk_follow_ups_opportunity',
        references: { collection: 'opportunities', fields: ['id'] },
        onDelete: 'set null',
      });
      collection.foreignKey('contactId', {
        name: 'fk_follow_ups_contact',
        references: { collection: 'contacts', fields: ['id'] },
        onDelete: 'set null',
      });
      collection.foreignKey('ownerId', {
        name: 'fk_follow_ups_owner',
        references: { collection: 'user', fields: ['id'] },
        onDelete: 'restrict',
      });
    });

    await builder.createCollection('followUpReminders', (collection) => {
      collection.increments('id');
      collection.integer('followUpId').notNull();
      collection.string('remindDate', { length: 10 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique(['followUpId', 'remindDate'], {
        name: 'uq_follow_up_reminders_pair',
      });
      collection.index('remindDate', { name: 'idx_follow_up_reminders_date' });
      collection.foreignKey('followUpId', {
        name: 'fk_follow_up_reminders_follow_up',
        references: { collection: 'followUps', fields: ['id'] },
        onDelete: 'cascade',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('followUpReminders');
    await builder.dropCollection('followUps');
  },
} satisfies MigrationDefinition);

export default migration;

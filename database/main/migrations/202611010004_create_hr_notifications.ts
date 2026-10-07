import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * In-app notifications for HR decisions.
 *
 * Approval and rejection of a leave request write one row addressed to the
 * applicant's account (`userId`), which is what makes the outcome visible to
 * the applicant without them having to revisit the request. `refType` and
 * `refId` point back at the record the notification is about.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611010004_create_hr_notifications',
  async up({ builder }) {
    await builder.createCollection('hrNotifications', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('body').nullable();
      collection.string('type', { length: 64 }).notNull().defaultTo('leave');
      collection.string('refType', { length: 64 }).nullable();
      collection.integer('refId').nullable();
      collection.boolean('read').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.index('userId', { name: 'idx_hr_notifications_user' });
      collection.index('read', { name: 'idx_hr_notifications_read' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('hrNotifications');
  },
});

export default migration;

import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The employee leave requests a person submits and a manager decides.
 *
 * Dates are stored as calendar dates (`date`, `YYYY-MM-DD`), not timestamps:
 * leave is taken a whole day at a time, and a date comparison must not depend on
 * the server's time zone. `userName` and `reviewerName` are snapshots so a
 * decided request still reads correctly after a person is renamed.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610260001_create_leave_requests',

  async up({ builder }) {
    await builder.createCollection('leaveRequests', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.string('userName', { length: 255 }).notNull();
      collection
        .string('type', { length: 32 })
        .notNull()
        .defaultTo('annual');
      collection.date('startDate').notNull();
      collection.date('endDate').notNull();
      collection.integer('days').notNull();
      collection.text('reason').notNull();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection.string('reviewerId', { length: 64 }).nullable();
      collection.string('reviewerName', { length: 255 }).nullable();
      collection.text('reviewComment').nullable();
      collection.datetime('submittedAt').notNull();
      collection.datetime('decidedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_leave_requests' });
      collection.index('userId', { name: 'idx_leave_requests_user_id' });
      collection.index('status', { name: 'idx_leave_requests_status' });
      collection.index('startDate', { name: 'idx_leave_requests_start_date' });
      collection.index('endDate', { name: 'idx_leave_requests_end_date' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('leaveRequests');
  },
});

export default migration;

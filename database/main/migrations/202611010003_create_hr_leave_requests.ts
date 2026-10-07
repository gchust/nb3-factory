import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Leave requests and their approval trail.
 *
 * A request belongs to exactly one employee record (`employeeId`) and carries
 * the applicant's account (`userId`) and department (`departmentId`) so a
 * supervisor's scope is a plain column filter instead of a join. `status`
 * moves `pending -> approved | rejected`; a rejected request may be edited and
 * resubmitted, which bumps `revision` and returns it to `pending`, so the
 * previous decision is kept in the audit trail rather than overwritten in
 * place. `rejectionReason` is required whenever `status` becomes `rejected`.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611010003_create_hr_leave_requests',
  async up({ builder }) {
    await builder.createCollection('hrLeaveRequests', (collection) => {
      collection.increments('id');
      collection.integer('employeeId').notNull();
      collection.string('userId', { length: 64 }).nullable();
      collection.integer('departmentId').nullable();
      collection.string('type', { length: 32 }).notNull().defaultTo('annual');
      collection.date('startDate').notNull();
      collection.date('endDate').notNull();
      collection.integer('days').nullable();
      collection.text('reason').nullable();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection.string('approverId', { length: 64 }).nullable();
      collection.string('approverName', { length: 255 }).nullable();
      collection.datetime('decidedAt').nullable();
      collection.text('rejectionReason').nullable();
      collection.integer('revision').notNull().defaultTo(1);
      collection.datetime('submittedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('employeeId', { name: 'idx_hr_leave_employee' });
      collection.index('userId', { name: 'idx_hr_leave_user' });
      collection.index('departmentId', { name: 'idx_hr_leave_department' });
      collection.index('status', { name: 'idx_hr_leave_status' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('hrLeaveRequests');
  },
});

export default migration;

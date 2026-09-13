import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609130003_create_hr_leave_requests',

  async up({ builder }) {
    await builder.createCollection('hrLeaveRequests', (collection) => {
      collection.increments('id');
      collection.integer('employeeId', { nullable: false });
      // annual | sick | personal
      collection.string('type', { length: 32, nullable: false });
      collection.string('startDate', { length: 10, nullable: false });
      collection.string('endDate', { length: 10, nullable: false });
      // Natural calendar days, always computed by the server.
      collection.integer('days', { nullable: false });
      collection.text('reason', { nullable: true });
      collection.string('attachmentId', { length: 64, nullable: true });
      collection.string('attachmentName', { length: 255, nullable: true });
      collection
        .string('status', { length: 32, nullable: false })
        .defaultTo('pending');
      collection.string('approverId', { length: 255, nullable: true });
      collection.string('approverName', { length: 255, nullable: true });
      collection.text('approvalComment', { nullable: true });
      collection.datetime('decidedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('employeeId');
      collection.index('status');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('hrLeaveRequests');
  },
});

export default migration;

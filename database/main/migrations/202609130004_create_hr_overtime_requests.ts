import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609130004_create_hr_overtime_requests',

  async up({ builder }) {
    await builder.createCollection('hrOvertimeRequests', (collection) => {
      collection.increments('id');
      collection.integer('employeeId', { nullable: false });
      collection.string('overtimeDate', { length: 10, nullable: false });
      collection.decimal('hours', { precision: 6, scale: 2, nullable: false });
      collection.text('reason', { nullable: true });
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
      collection.index('overtimeDate');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('hrOvertimeRequests');
  },
});

export default migration;

import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Daily inspection tasks, the at-most-once-per-day overdue reminder ledger, the
 * scheduler run record and the attachment join table.
 *
 * The unique constraints are the idempotency guarantee: generating the same day's
 * inspections twice, or sending the same day's reminder twice, is a no-op.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611010003_create_service_ops',

  async up({ builder }) {
    await builder.createCollection('inspectionTasks', (c) => {
      c.string('id', { length: 64 }).notNull();
      c.primary('id');
      c.string('deviceId', { length: 64 }).notNull();
      c.string('assigneeId', { length: 64 }).nullable();
      c.date('planDate').notNull();
      // pending | completed | skipped
      c.string('status', { length: 16 }).notNull().defaultTo('pending');
      // normal | abnormal
      c.string('result', { length: 16 }).nullable();
      c.text('remark').nullable();
      c.datetime('completedAt').nullable();
      c.datetime('createdAt').notNull();
      c.datetime('updatedAt').notNull();
      c.unique(['deviceId', 'planDate']);
      c.index('planDate');
      c.index('assigneeId');
      c.index('status');
    });

    await builder.createCollection('overdueReminders', (c) => {
      c.string('id', { length: 64 }).notNull();
      c.primary('id');
      c.string('workOrderId', { length: 64 }).notNull();
      c.string('recipientId', { length: 64 }).nullable();
      c.date('sentDate').notNull();
      c.string('channel', { length: 32 }).notNull().defaultTo('inbox');
      c.datetime('createdAt').notNull();
      c.unique(['workOrderId', 'sentDate']);
      c.index('sentDate');
    });

    // One row per scheduled business run, so a repeated firing inspects to the same
    // recorded state instead of doing the work again.
    await builder.createCollection('scheduledRuns', (c) => {
      c.string('id', { length: 64 }).notNull();
      c.primary('id');
      c.string('taskKey', { length: 64 }).notNull();
      c.date('runDate').notNull();
      // running | succeeded | failed
      c.string('status', { length: 16 }).notNull().defaultTo('running');
      c.text('summary').nullable();
      c.text('failureReason').nullable();
      c.datetime('finishedAt').nullable();
      c.datetime('createdAt').notNull();
      c.unique(['taskKey', 'runDate']);
      c.index('taskKey');
    });

    await builder.createCollection('workOrderFiles', (c) => {
      c.string('id', { length: 64 }).notNull();
      c.primary('id');
      c.string('workOrderId', { length: 64 }).notNull();
      c.string('fileId', { length: 64 }).notNull();
      // photo | report
      c.string('category', { length: 16 }).notNull().defaultTo('photo');
      c.string('uploadedById', { length: 64 }).nullable();
      c.datetime('createdAt').notNull();
      c.unique(['workOrderId', 'fileId']);
      c.index('workOrderId');
      c.index('fileId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('workOrderFiles');
    await builder.dropCollection('scheduledRuns');
    await builder.dropCollection('overdueReminders');
    await builder.dropCollection('inspectionTasks');
  },
});

export default migration;

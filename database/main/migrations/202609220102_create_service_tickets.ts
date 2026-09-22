import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/** Service tickets, their state history, collaboration shares and automation runs. */
const migration: MigrationDefinition = defineMigration({
  name: '202609220102_create_service_tickets',

  async up({ builder }) {
    await builder.createCollection('serviceTickets', (collection) => {
      collection.increments('id');
      collection.string('ticketNo', { length: 64, nullable: false });
      collection.integer('customerId', { nullable: false });
      collection.integer('deviceId', { nullable: false });
      collection.string('title', { length: 200, nullable: false });
      collection.text('description');
      collection.string('priority', {
        length: 16,
        nullable: false,
        defaultValue: 'normal',
      });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'draft',
      });
      collection.string('region', { length: 16, nullable: false });
      collection.string('assigneeId', { length: 64 });
      collection.boolean('confidential', {
        nullable: false,
        defaultValue: false,
      });
      collection.string('reporterId', { length: 64 });
      collection.string('reporterName', { length: 128 });
      collection.string('source', {
        length: 16,
        nullable: false,
        defaultValue: 'manual',
      });
      collection.string('externalEventId', { length: 128 });
      collection.text('processNotes');
      collection.text('resolution');
      collection.decimal('laborHours', { precision: 8, scale: 2 });
      collection.datetime('dueAt');
      collection.datetime('submittedAt');
      collection.datetime('assignedAt');
      collection.datetime('startedAt');
      collection.datetime('closedAt');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('ticketNo');
      collection.unique('externalEventId');
      collection.index('status');
      collection.index('region');
      collection.index('assigneeId');
      collection.index('customerId');
      collection.index('deviceId');
      collection.index('confidential');
    });

    await builder.createCollection('serviceTicketLogs', (collection) => {
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.string('operatorId', { length: 64 });
      collection.string('operatorName', { length: 128 });
      collection.string('action', { length: 32, nullable: false });
      collection.string('fromStatus', { length: 32 });
      collection.string('toStatus', { length: 32 });
      collection.text('note');
      collection.text('reason');
      collection.decimal('laborHours', { precision: 8, scale: 2 });
      collection.datetime('createdAt', { nullable: false });
      collection.index('ticketId');
      collection.index('action');
    });

    await builder.createCollection('serviceTicketShares', (collection) => {
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.string('userId', { length: 64, nullable: false });
      collection.string('grantedById', { length: 64 });
      collection.boolean('active', { nullable: false, defaultValue: true });
      collection.datetime('revokedAt');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['ticketId', 'userId']);
      collection.index('userId');
    });

    await builder.createCollection('serviceAutomationRuns', (collection) => {
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.string('kind', { length: 32, nullable: false });
      collection.string('status', {
        length: 16,
        nullable: false,
        defaultValue: 'succeeded',
      });
      collection.json('steps');
      collection.text('error');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('ticketId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('serviceAutomationRuns');
    await builder.dropCollection('serviceTicketShares');
    await builder.dropCollection('serviceTicketLogs');
    await builder.dropCollection('serviceTickets');
  },
});

export default migration;

import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Core schema for the equipment after-sales service and inspection system.
 * Self-contained: every table, field and constraint is spelled out here so a
 * future edit to the application's runtime code cannot change what this
 * history means.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010001_equipment_service_core',
  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.string('contactName', { length: 128, nullable: true });
      collection.string('phone', { length: 64, nullable: true });
      collection.string('address', { length: 255, nullable: true });
      collection.text('note', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });

    await builder.createCollection('devices', (collection) => {
      collection.increments('id');
      collection.string('serial', { length: 128, nullable: false });
      collection.string('name', { length: 255, nullable: false });
      collection.string('model', { length: 128, nullable: true });
      collection.integer('customerId', { nullable: false });
      collection.string('engineerId', { length: 64, nullable: true });
      collection.boolean('enabled', { nullable: false, defaultValue: true });
      collection.datetime('nextInspectionAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('serial', { name: 'uq_devices_serial' });
      collection.index('customerId', { name: 'idx_devices_customer' });
      collection.index('engineerId', { name: 'idx_devices_engineer' });
    });

    await builder.createCollection('tickets', (collection) => {
      collection.increments('id');
      collection.string('ticketNo', { length: 64, nullable: false });
      collection.string('title', { length: 255, nullable: false });
      collection.integer('customerId', { nullable: false });
      collection.integer('deviceId', { nullable: false });
      collection.text('problem', { nullable: true });
      collection.string('priority', {
        length: 16,
        nullable: false,
        defaultValue: 'normal',
      });
      collection.datetime('dueAt', { nullable: true });
      collection.string('ownerId', { length: 64, nullable: true });
      collection.boolean('confidential', {
        nullable: false,
        defaultValue: false,
      });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'pendingAcceptance',
      });
      collection.text('result', { nullable: true });
      collection.text('resolutionNote', { nullable: true });
      collection.text('rejectReason', { nullable: true });
      collection.datetime('acceptedAt', { nullable: true });
      collection.datetime('closedAt', { nullable: true });
      collection.string('externalEventNo', { length: 128, nullable: true });
      collection.string('source', {
        length: 32,
        nullable: false,
        defaultValue: 'manual',
      });
      collection.string('createdById', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('ticketNo', { name: 'uq_tickets_ticket_no' });
      collection.unique('externalEventNo', {
        name: 'uq_tickets_external_event',
      });
      collection.index('status', { name: 'idx_tickets_status' });
      collection.index('ownerId', { name: 'idx_tickets_owner' });
      collection.index('deviceId', { name: 'idx_tickets_device' });
      collection.index('customerId', { name: 'idx_tickets_customer' });
    });

    await builder.createCollection('inspections', (collection) => {
      collection.increments('id');
      collection.integer('deviceId', { nullable: false });
      collection.date('plannedDate', { nullable: false });
      collection.string('ownerId', { length: 64, nullable: false });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'pending',
      });
      collection.text('result', { nullable: true });
      collection.datetime('completedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['deviceId', 'plannedDate'], {
        name: 'uq_inspections_device_date',
      });
      collection.index('ownerId', { name: 'idx_inspections_owner' });
      collection.index('status', { name: 'idx_inspections_status' });
    });

    await builder.createCollection('knowledge_articles', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.string('summary', { length: 500, nullable: true });
      collection.text('body', { nullable: false });
      collection.boolean('published', { nullable: false, defaultValue: false });
      collection.string('createdById', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('published', { name: 'idx_knowledge_published' });
    });

    await builder.createCollection('ticket_shares', (collection) => {
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.string('engineerId', { length: 64, nullable: false });
      collection.string('grantedById', { length: 64, nullable: true });
      collection.boolean('active', { nullable: false, defaultValue: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['ticketId', 'engineerId'], {
        name: 'uq_ticket_shares_ticket_engineer',
      });
      collection.index('engineerId', { name: 'idx_ticket_shares_engineer' });
    });

    await builder.createCollection('acceptance_logs', (collection) => {
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.string('step', { length: 64, nullable: false });
      collection.string('status', { length: 16, nullable: false });
      collection.text('message', { nullable: true });
      collection.boolean('retryable', { nullable: false, defaultValue: false });
      collection.string('eventKey', { length: 160, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('ticketId', { name: 'idx_acceptance_logs_ticket' });
    });

    await builder.createCollection('overdue_reminders', (collection) => {
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.date('reminderDate', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.unique(['ticketId', 'reminderDate'], {
        name: 'uq_overdue_reminders_ticket_date',
      });
    });

    // App-owned attachment collection consumed by the File Repository. The
    // field set is fixed by @nocobase/app-plugin-file; `ticketId` and
    // `category` are nullable business columns the application fills after an
    // upload commits.
    await builder.createCollection('ticket_files', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255, nullable: false });
      collection.text('key', { nullable: false });
      collection.text('filename', { nullable: false });
      collection.string('ext', { length: 32, nullable: false });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.bigInt('size', { nullable: false });
      collection.integer('ticketId', { nullable: true });
      collection.string('category', { length: 32, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('ticketId', { name: 'idx_ticket_files_ticket' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('ticket_files');
    await builder.dropCollection('overdue_reminders');
    await builder.dropCollection('acceptance_logs');
    await builder.dropCollection('ticket_shares');
    await builder.dropCollection('knowledge_articles');
    await builder.dropCollection('inspections');
    await builder.dropCollection('tickets');
    await builder.dropCollection('devices');
    await builder.dropCollection('customers');
  },
});

export default migration;

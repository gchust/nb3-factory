import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Core schema for the device after-sales service and inspection collaboration
 * application.
 *
 * Self-contained by rule: every table, field and constraint is spelled out
 * here, and `down` reverses them in dependency order. Nothing imports the
 * application's business declarations.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609010001_create_service_core',

  async up({ builder }) {
    await builder.createCollection('serviceCustomers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
      collection.string('contactName', { length: 64 });
      collection.string('contactPhone', { length: 32 });
      collection.string('address', { length: 255 });
      collection.text('note');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('name');
    });

    await builder.createCollection('serviceDevices', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64, nullable: false });
      collection.string('name', { length: 128, nullable: false });
      collection.string('model', { length: 128 });
      collection.string('serialNo', { length: 128 });
      collection.integer('customerId', { nullable: false });
      collection.string('engineerId', { length: 64 });
      collection.boolean('enabled', { nullable: false, defaultValue: true });
      collection.date('nextInspectionDate');
      collection.date('lastInspectionDate');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('code');
      collection.index('customerId');
      collection.index('engineerId');
      collection.index('nextInspectionDate');
      collection.foreignKey('customerId', {
        references: { collection: 'serviceCustomers', fields: ['id'] },
        name: 'fk_service_devices_customer',
      });
    });

    await builder.createCollection('serviceTickets', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 32, nullable: false });
      collection.string('title', { length: 200, nullable: false });
      collection.text('description');
      collection.integer('customerId', { nullable: false });
      collection.integer('deviceId');
      collection.string('priority', { length: 16, nullable: false });
      collection.boolean('confidential', {
        nullable: false,
        defaultValue: false,
      });
      collection.string('status', { length: 24, nullable: false });
      collection.string('assigneeId', { length: 64 });
      collection.string('createdById', { length: 64 });
      collection.string('source', { length: 16, nullable: false });
      collection.string('externalEventNo', { length: 96 });
      collection.datetime('dueAt');
      collection.datetime('acceptedAt');
      collection.string('acceptedById', { length: 64 });
      collection.text('acceptNote');
      collection.text('processNote');
      collection.text('resultNote');
      collection.text('rejectReason');
      collection.text('confirmationNote');
      collection.datetime('closedAt');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('code');
      collection.unique('externalEventNo');
      collection.index('status');
      collection.index('priority');
      collection.index('assigneeId');
      collection.index('customerId');
      collection.index('deviceId');
      collection.foreignKey('customerId', {
        references: { collection: 'serviceCustomers', fields: ['id'] },
        name: 'fk_service_tickets_customer',
      });
      collection.foreignKey('deviceId', {
        references: { collection: 'serviceDevices', fields: ['id'] },
        name: 'fk_service_tickets_device',
      });
    });

    await builder.createCollection('serviceInspections', (collection) => {
      collection.increments('id');
      collection.integer('deviceId', { nullable: false });
      collection.string('inspectionDate', { length: 16, nullable: false });
      collection.string('engineerId', { length: 64 });
      collection.string('status', { length: 16, nullable: false });
      collection.text('resultNote');
      collection.integer('ticketId');
      collection.boolean('reminderSent', {
        nullable: false,
        defaultValue: false,
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['deviceId', 'inspectionDate'], {
        name: 'uq_service_inspections_device_date',
      });
      collection.index('inspectionDate');
      collection.index('engineerId');
    });

    await builder.createCollection('serviceKnowledgeArticles', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200, nullable: false });
      collection.text('body');
      collection.string('category', { length: 64 });
      collection.boolean('published', { nullable: false, defaultValue: false });
      collection.string('authorId', { length: 64 });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('published');
    });

    await builder.createCollection('serviceTicketShares', (collection) => {
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.string('engineerId', { length: 64, nullable: false });
      collection.datetime('expiresAt');
      collection.string('createdById', { length: 64 });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['ticketId', 'engineerId'], {
        name: 'uq_service_ticket_shares_ticket_engineer',
      });
      collection.index('ticketId');
      collection.index('engineerId');
    });

    await builder.createCollection('serviceExecutionLogs', (collection) => {
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.string('actorId', { length: 64 });
      collection.string('action', { length: 32, nullable: false });
      collection.text('detail');
      collection.datetime('createdAt', { nullable: false });
      collection.index('ticketId');
    });

    // File collection consumed by the File plugin's server-side repository. The
    // id must be a server-generated UUID string, not an auto-increment value.
    await builder.createCollection('serviceTicketFiles', (collection) => {
      collection.uuid('id');
      collection.string('disk', { length: 64, nullable: false });
      collection.string('key', { length: 512, nullable: false });
      collection.string('filename', { length: 512, nullable: false });
      collection.string('ext', { length: 32 });
      collection.string('mimeType', { length: 191, nullable: false });
      collection.integer('size', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.primary('id');
    });

    await builder.createCollection('serviceTicketAttachments', (collection) => {
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.string('fileId', { length: 64, nullable: false });
      collection.string('kind', { length: 16, nullable: false });
      collection.string('uploadedById', { length: 64 });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['ticketId', 'fileId'], {
        name: 'uq_service_ticket_attachments_ticket_file',
      });
      collection.index('ticketId');
      collection.index('fileId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('serviceTicketAttachments');
    await builder.dropCollection('serviceTicketFiles');
    await builder.dropCollection('serviceExecutionLogs');
    await builder.dropCollection('serviceTicketShares');
    await builder.dropCollection('serviceKnowledgeArticles');
    await builder.dropCollection('serviceInspections');
    await builder.dropCollection('serviceTickets');
    await builder.dropCollection('serviceDevices');
    await builder.dropCollection('serviceCustomers');
  },
});

export default migration;

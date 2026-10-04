import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the equipment after-sales service and inspection collaboration
 * tables. Self-contained on purpose: it never imports a live collection
 * definition, so an already-applied migration keeps its original meaning.
 *
 * Foreign keys deliberately stay out. `users` and the plugin-owned file
 * collection are created by other migrations whose ordering this application
 * does not own; the service layer validates those references instead.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610200001_create_service_collections',
  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.title('Customers');
      collection.increments('id');
      collection.string('code', { length: 64 }).notNull().unique();
      collection.string('name', { length: 128 }).notNull();
      collection.string('contact', { length: 64 }).nullable();
      collection.string('phone', { length: 32 }).nullable();
      collection
        .string('level', { length: 16 })
        .notNull()
        .defaultTo('standard');
      collection.string('region', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    await builder.createCollection('devices', (collection) => {
      collection.title('Devices');
      collection.increments('id');
      collection.string('deviceNo', { length: 64 }).notNull().unique();
      collection.string('model', { length: 128 }).notNull();
      collection.string('serialNo', { length: 64 }).nullable();
      collection.integer('customerId').index();
      collection.string('status', { length: 32 }).notNull().defaultTo('active');
      collection.datetime('installedAt').nullable();
      collection.datetime('warrantyUntil').nullable();
      collection.datetime('nextInspectionAt').nullable();
      collection.string('location', { length: 128 }).nullable();
      collection.text('notes').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    await builder.createCollection('tickets', (collection) => {
      collection.title('Service tickets');
      collection.increments('id');
      collection.string('ticketNo', { length: 64 }).notNull().unique();
      collection.string('title', { length: 256 }).notNull();
      collection.text('description').nullable();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection
        .string('priority', { length: 16 })
        .notNull()
        .defaultTo('normal');
      collection.boolean('confidential').notNull().defaultTo(false);
      collection.integer('customerId').index();
      collection.integer('deviceId').index();
      collection.integer('assigneeId').index();
      collection.integer('reporterId').nullable();
      collection
        .string('source', { length: 32 })
        .notNull()
        .defaultTo('internal');
      collection.string('externalEventNo', { length: 64 }).nullable().unique();
      collection.datetime('acceptedAt').nullable();
      collection.datetime('startedAt').nullable();
      collection.datetime('submittedAt').nullable();
      collection.datetime('closedAt').nullable();
      collection.datetime('slaDueAt').nullable();
      collection.text('handling').nullable();
      collection.text('resolution').nullable();
      collection.text('acceptanceNote').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    await builder.createCollection('ticket_events', (collection) => {
      collection.title('Service ticket events');
      collection.increments('id');
      collection.integer('ticketId').notNull().index();
      collection.string('type', { length: 48 }).notNull();
      collection.string('status', { length: 32 }).nullable();
      collection.integer('operatorId');
      collection.string('operatorName', { length: 128 }).nullable();
      collection.text('comment').nullable();
      collection.json('payload').nullable();
      collection.datetime('createdAt').notNull();
    });

    await builder.createCollection('ticket_shares', (collection) => {
      collection.title('Service ticket shares');
      collection.increments('id');
      collection.integer('ticketId').notNull().index();
      collection.integer('granteeId').notNull().index();
      collection.string('granteeName', { length: 128 }).nullable();
      collection.integer('grantedById');
      collection.string('reason', { length: 256 }).nullable();
      collection.string('sharingRuleKey', { length: 96 }).nullable();
      collection.datetime('expiresAt').nullable();
      collection.boolean('revoked').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    await builder.createCollection('inspections', (collection) => {
      collection.title('Device inspections');
      collection.increments('id');
      collection.integer('deviceId').notNull().index();
      collection.string('plannedDate', { length: 10 }).notNull();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('planned');
      collection.integer('assigneeId').index();
      collection.string('result', { length: 32 }).nullable();
      collection.text('notes').nullable();
      collection.integer('ticketId');
      collection.datetime('completedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique(['deviceId', 'plannedDate']);
    });

    await builder.createCollection('knowledge_articles', (collection) => {
      collection.title('Knowledge articles');
      collection.increments('id');
      collection.string('title', { length: 256 }).notNull();
      collection.string('category', { length: 64 }).nullable();
      collection.string('deviceModel', { length: 128 }).nullable();
      collection.string('tags', { length: 256 }).nullable();
      collection
        .string('status', { length: 16 })
        .notNull()
        .defaultTo('published');
      collection.text('summary').nullable();
      collection.text('content').notNull();
      collection.integer('createdById').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    // App-owned file collection, required shape from the file plugin contract.
    await builder.createCollection('ticket_files', (collection) => {
      collection.title('Ticket files');
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    await builder.createCollection('ticket_attachments', (collection) => {
      collection.title('Ticket attachments');
      collection.increments('id');
      collection.integer('ticketId').notNull().index();
      collection.string('fileId', { length: 64 }).notNull().index();
      collection.string('kind', { length: 32 }).notNull().defaultTo('repair');
      collection.string('note', { length: 256 }).nullable();
      collection.integer('createdById').nullable();
      collection.datetime('createdAt').notNull();
    });
  },
  async down({ builder }) {
    await builder.dropCollection('ticket_attachments');
    await builder.dropCollection('ticket_files');
    await builder.dropCollection('knowledge_articles');
    await builder.dropCollection('inspections');
    await builder.dropCollection('ticket_shares');
    await builder.dropCollection('ticket_events');
    await builder.dropCollection('tickets');
    await builder.dropCollection('devices');
    await builder.dropCollection('customers');
  },
});

export default migration;

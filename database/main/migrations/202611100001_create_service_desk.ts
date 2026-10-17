import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611100001_create_service_desk',
  async up({ builder }) {
    await builder.createCollection('serviceDeskTickets', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200, nullable: false });
      collection.text('description', { nullable: false });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'open',
      });
      collection.string('priority', {
        length: 32,
        nullable: false,
        defaultValue: 'normal',
      });
      collection.string('requesterId', { length: 255, nullable: false });
      collection.string('assigneeId', { length: 255, nullable: true });
      collection.text('resolution', { nullable: true });
      collection.datetime('slaDueAt', { nullable: false });
      collection.datetime('assignedAt', { nullable: true });
      collection.datetime('resolvedAt', { nullable: true });
      collection.datetime('closedAt', { nullable: true });
      collection.datetime('reopenedAt', { nullable: true });
      collection.datetime('overdueNotifiedAt', { nullable: true });
      collection.integer('commentCount', { nullable: false, defaultValue: 0 });
      collection.json('attachments', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index(['status', 'slaDueAt']);
      collection.index(['requesterId']);
      collection.index(['assigneeId']);
    });

    await builder.createCollection('serviceDeskComments', (collection) => {
      collection.increments('id');
      collection.integer('ticketId', { nullable: false });
      collection.string('authorId', { length: 255, nullable: false });
      collection.string('kind', {
        length: 32,
        nullable: false,
        defaultValue: 'comment',
      });
      collection.text('body', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index(['ticketId', 'createdAt']);
      collection.foreignKey('ticketId', {
        name: 'fk_service_desk_comments_ticket',
        references: { collection: 'serviceDeskTickets', fields: ['id'] },
        onDelete: 'cascade',
      });
    });

    await builder.createCollection('serviceDeskFiles', (collection) => {
      collection.uuid('id').primary();
      collection.string('disk', { length: 64, nullable: false });
      collection.string('key', { length: 1024, nullable: false });
      collection.string('filename', { length: 512, nullable: false });
      collection.string('ext', { length: 32, nullable: false });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.bigInt('size', { nullable: false });
      collection.string('uploadedById', { length: 255, nullable: true });
      collection.integer('ticketId', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index(['ticketId']);
      collection.index(['uploadedById']);
      collection.foreignKey('ticketId', {
        name: 'fk_service_desk_files_ticket',
        references: { collection: 'serviceDeskTickets', fields: ['id'] },
        onDelete: 'set null',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('serviceDeskFiles');
    await builder.dropCollection('serviceDeskComments');
    await builder.dropCollection('serviceDeskTickets');
  },
});

export default migration;

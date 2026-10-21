import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Service desk tables are application-owned history: every field and index is
// written out here, so a later change is a new migration rather than an edit
// to this one.
const migration: MigrationDefinition = defineMigration({
  name: '202610160001_create_service_tickets',
  async up({ builder }) {
    await builder.createCollection('tickets', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('ticketNo', { length: 32 }).notNull();
      collection.string('title', { length: 200 }).notNull();
      collection.text('description').notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.string('priority', { length: 16 }).notNull();
      collection.string('category', { length: 64 }).notNull();
      collection.string('requesterId', { length: 64 }).notNull();
      collection.string('assigneeId', { length: 64 }).nullable();
      collection.datetime('resolvedAt').nullable();
      collection.datetime('closedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('ticketNo', { name: 'uq_tickets_ticket_no' });
      collection.index('status', { name: 'idx_tickets_status' });
      collection.index('priority', { name: 'idx_tickets_priority' });
      collection.index('category', { name: 'idx_tickets_category' });
      collection.index('requesterId', { name: 'idx_tickets_requester' });
      collection.index('assigneeId', { name: 'idx_tickets_assignee' });
      collection.index('createdAt', { name: 'idx_tickets_created_at' });
    });

    await builder.createCollection('ticketComments', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('ticketId', { length: 36 }).notNull();
      collection.string('authorId', { length: 64 }).notNull();
      collection.text('body').notNull();
      collection.boolean('internal').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('ticketId', { name: 'idx_ticket_comments_ticket' });
      collection.index('authorId', { name: 'idx_ticket_comments_author' });
      collection.index('createdAt', { name: 'idx_ticket_comments_created_at' });
    });

    await builder.createCollection('ticketScreenshots', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('ticketId', { length: 36 }).notNull();
      collection.string('fileId', { length: 36 }).notNull();
      collection.string('commentId', { length: 36 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('fileId', { name: 'uq_ticket_screenshots_file' });
      collection.index('ticketId', { name: 'idx_ticket_screenshots_ticket' });
      collection.index('commentId', { name: 'idx_ticket_screenshots_comment' });
    });

    // The file plugin's fixed metadata contract. It has no business columns;
    // ownership is carried by ticketScreenshots, which is authorized before a
    // file is read.
    await builder.createCollection('ticketFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index(['disk', 'key'], { name: 'idx_ticket_files_disk_key' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('ticketFiles');
    await builder.dropCollection('ticketScreenshots');
    await builder.dropCollection('ticketComments');
    await builder.dropCollection('tickets');
  },
});

export default migration;

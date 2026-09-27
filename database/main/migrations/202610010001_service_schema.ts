import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Equipment after-sales service and inspection collaboration system.
 *
 * The migration is self-contained history: every field, index and constraint is
 * spelled out here. Relations are declared as plain indexed columns rather than
 * Collection relations so that read paths can be assembled explicitly in the
 * server routes, which keeps this schema stable across upgrades.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010001_service_schema',
  async up({ builder }) {
    // Regions / service teams that a person can belong to. A team carries jobs
    // (permission-set keys) that its members inherit.
    await builder.createCollection('service_teams', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64 }).notNull().unique();
      collection.string('name', { length: 128 }).notNull();
      collection.string('region', { length: 64 }).notNull();
      collection.text('description').nullable();
      collection.boolean('enabled').notNull().defaultTo(true);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    // Direct team membership plus the job key the membership grants. A user's
    // effective roles are their directly assigned permission sets plus the jobs
    // of every team they belong to.
    await builder.createCollection('service_team_members', (collection) => {
      collection.increments('id');
      collection.integer('teamId').notNull().index();
      collection.string('userId', { length: 64 }).notNull().index();
      collection.string('userName', { length: 128 }).notNull();
      collection.string('jobKey', { length: 96 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique(['teamId', 'userId', 'jobKey']);
    });

    await builder.createCollection('service_customers', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64 }).notNull().unique();
      collection.string('name', { length: 128 }).notNull();
      collection.string('contactName', { length: 128 }).nullable();
      collection.string('contactPhone', { length: 64 }).nullable();
      collection.string('contactEmail', { length: 160 }).nullable();
      collection.string('region', { length: 64 }).notNull().defaultTo('east');
      collection.integer('teamId').nullable().index();
      collection
        .string('level', { length: 32 })
        .notNull()
        .defaultTo('standard');
      collection.string('status', { length: 32 }).notNull().defaultTo('active');
      collection.text('address').nullable();
      collection.text('notes').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    await builder.createCollection('service_devices', (collection) => {
      collection.increments('id');
      collection.string('serialNumber', { length: 96 }).notNull().unique();
      collection.string('name', { length: 160 }).notNull();
      collection.string('model', { length: 96 }).nullable();
      collection.integer('customerId').notNull().index();
      collection.string('region', { length: 64 }).notNull().defaultTo('east');
      collection.string('location', { length: 200 }).nullable();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('in_service');
      collection.datetime('installedAt').nullable();
      collection.datetime('warrantyUntil').nullable();
      collection.boolean('enabled').notNull().defaultTo(true);
      collection.text('notes').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    await builder.createCollection('service_tickets', (collection) => {
      collection.increments('id');
      collection.string('serial', { length: 48 }).notNull().unique();
      collection.string('title', { length: 200 }).notNull();
      collection.text('description').nullable();
      collection.string('type', { length: 32 }).notNull().defaultTo('repair');
      collection
        .string('priority', { length: 32 })
        .notNull()
        .defaultTo('normal');
      collection.string('status', { length: 32 }).notNull().defaultTo('draft');
      collection.boolean('confidential').notNull().defaultTo(false);
      collection.integer('customerId').notNull().index();
      collection
        .string('customerName', { length: 128 })
        .notNull()
        .defaultTo('');
      collection.integer('deviceId').nullable().index();
      collection.string('deviceSerial', { length: 96 }).nullable();
      collection.string('region', { length: 64 }).notNull().defaultTo('east');
      collection.string('assigneeId', { length: 64 }).nullable().index();
      collection.string('assigneeName', { length: 128 }).nullable();
      collection.string('reporterId', { length: 64 }).notNull().defaultTo('');
      collection
        .string('reporterName', { length: 128 })
        .notNull()
        .defaultTo('');
      collection.string('source', { length: 32 }).notNull().defaultTo('manual');
      collection.datetime('slaDueAt').nullable();
      collection.datetime('submittedAt').nullable();
      collection.datetime('assignedAt').nullable();
      collection.datetime('startedAt').nullable();
      collection.datetime('resolvedAt').nullable();
      collection.datetime('confirmedAt').nullable();
      collection.datetime('closedAt').nullable();
      collection.datetime('cancelledAt').nullable();
      collection.text('resolution').nullable();
      collection.text('cancelReason').nullable();
      collection.text('returnReason').nullable();
      collection.decimal('laborCost', { precision: 12, scale: 2 }).nullable();
      collection.decimal('partsCost', { precision: 12, scale: 2 }).nullable();
      collection.text('internalNotes').nullable();
      collection.integer('returnCount').notNull().defaultTo(0);
      collection.boolean('overdue').notNull().defaultTo(false);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    // One visible log for every state transition, handling note and automated
    // acceptance step. `requestKey` makes a retried action idempotent.
    await builder.createCollection('service_ticket_logs', (collection) => {
      collection.increments('id');
      collection.integer('ticketId').notNull().index();
      collection.string('kind', { length: 32 }).notNull().defaultTo('comment');
      collection.string('action', { length: 48 }).nullable();
      collection.string('fromStatus', { length: 32 }).nullable();
      collection.string('toStatus', { length: 32 }).nullable();
      collection.string('step', { length: 64 }).nullable();
      collection.string('stepStatus', { length: 24 }).nullable();
      collection.text('content').notNull().defaultTo('');
      collection.string('actorId', { length: 64 }).nullable();
      collection.string('actorName', { length: 128 }).nullable();
      collection.string('actorRole', { length: 64 }).nullable();
      collection.string('requestKey', { length: 128 }).nullable().index();
      collection.json('metadata').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    // Ticket-level collaboration. Confidential tickets are never visible to a
    // collaborator even when a share row exists for them.
    await builder.createCollection('service_ticket_shares', (collection) => {
      collection.increments('id');
      collection.integer('ticketId').notNull().index();
      collection.string('userId', { length: 64 }).notNull().index();
      collection.string('userName', { length: 128 }).notNull();
      collection
        .string('permission', { length: 24 })
        .notNull()
        .defaultTo('read');
      collection.text('reason').nullable();
      collection.string('sharedById', { length: 64 }).nullable();
      collection.string('sharedByName', { length: 128 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique(['ticketId', 'userId']);
    });

    await builder.createCollection('service_inspection_plans', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 160 }).notNull();
      collection.integer('deviceId').notNull().index();
      collection.string('deviceSerial', { length: 96 }).nullable();
      collection
        .string('cron', { length: 64 })
        .notNull()
        .defaultTo('0 9 * * *');
      collection
        .string('timezone', { length: 64 })
        .notNull()
        .defaultTo('Asia/Shanghai');
      collection.boolean('enabled').notNull().defaultTo(true);
      collection
        .string('taskType', { length: 32 })
        .notNull()
        .defaultTo('inspection');
      collection.datetime('lastRunAt').nullable();
      collection.datetime('nextRunAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    // One row per plan per day. The unique pair is what deduplicates a re-run.
    await builder.createCollection('service_inspection_tasks', (collection) => {
      collection.increments('id');
      collection.integer('planId').notNull().index();
      collection.integer('deviceId').notNull().index();
      collection.string('deviceSerial', { length: 96 }).nullable();
      collection.string('runDate', { length: 10 }).notNull();
      collection
        .string('status', { length: 24 })
        .notNull()
        .defaultTo('pending');
      collection.integer('ticketId').nullable().index();
      collection
        .string('triggeredBy', { length: 24 })
        .notNull()
        .defaultTo('schedule');
      collection.text('result').nullable();
      collection.datetime('startedAt').nullable();
      collection.datetime('finishedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique(['planId', 'runDate']);
    });

    await builder.createCollection(
      'service_knowledge_articles',
      (collection) => {
        collection.increments('id');
        collection.string('slug', { length: 128 }).notNull().unique();
        collection.string('title', { length: 200 }).notNull();
        collection.text('summary').nullable();
        collection.text('content').nullable();
        collection
          .string('category', { length: 64 })
          .notNull()
          .defaultTo('general');
        collection
          .string('status', { length: 24 })
          .notNull()
          .defaultTo('draft');
        collection.json('tags').nullable();
        collection.string('authorId', { length: 64 }).nullable();
        collection.string('authorName', { length: 128 }).nullable();
        collection.datetime('publishedAt').nullable();
        collection.integer('viewCount').notNull().defaultTo(0);
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
      },
    );

    // External platform events. The unique idempotency key is the dedupe gate.
    await builder.createCollection(
      'service_integration_events',
      (collection) => {
        collection.increments('id');
        collection.string('idempotencyKey', { length: 160 }).notNull().unique();
        collection.string('eventType', { length: 64 }).notNull();
        collection.string('deviceSerial', { length: 96 }).nullable();
        collection
          .string('status', { length: 24 })
          .notNull()
          .defaultTo('accepted');
        collection.integer('ticketId').nullable().index();
        collection.json('payload').nullable();
        collection.text('error').nullable();
        collection.string('callerId', { length: 64 }).nullable();
        collection.datetime('processedAt').nullable();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
      },
    );

    // Delivery records for the optional external notification channel. When no
    // external channel is configured the row is written as `not_configured`.
    await builder.createCollection(
      'service_notification_deliveries',
      (collection) => {
        collection.increments('id');
        collection.string('notificationKey', { length: 160 }).notNull().index();
        collection
          .string('channel', { length: 64 })
          .notNull()
          .defaultTo('inbox');
        collection.string('status', { length: 32 }).notNull().defaultTo('sent');
        collection.integer('attempts').notNull().defaultTo(1);
        collection.string('recipientId', { length: 64 }).nullable();
        collection.string('recipientName', { length: 128 }).nullable();
        collection.string('title', { length: 200 }).notNull().defaultTo('');
        collection.text('body').notNull().defaultTo('');
        collection.integer('ticketId').nullable().index();
        collection.text('lastError').nullable();
        collection.datetime('nextRetryAt').nullable();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
      },
    );

    // File collection used by the File Repository upload API. The columns are
    // the fixed File Repository set; business links are nullable so upload can
    // commit before the business form is submitted.
    await builder.createCollection('service_attachments', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.integer('ticketId').nullable().index();
      collection.integer('knowledgeArticleId').nullable().index();
      collection.string('uploaderId', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });
  },
  async down({ builder }) {
    await builder.dropCollection('service_attachments');
    await builder.dropCollection('service_notification_deliveries');
    await builder.dropCollection('service_integration_events');
    await builder.dropCollection('service_knowledge_articles');
    await builder.dropCollection('service_inspection_tasks');
    await builder.dropCollection('service_inspection_plans');
    await builder.dropCollection('service_ticket_shares');
    await builder.dropCollection('service_ticket_logs');
    await builder.dropCollection('service_tickets');
    await builder.dropCollection('service_devices');
    await builder.dropCollection('service_customers');
    await builder.dropCollection('service_team_members');
    await builder.dropCollection('service_teams');
  },
});

export default migration;

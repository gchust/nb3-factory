import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Delivery management: projects, members, milestones, tasks, task result
 * versions, project materials, delivery submissions and the file collection
 * every attachment is stored in.
 *
 * Self-contained on purpose. No runtime collection definition, model or
 * registry is imported, so an already-applied migration keeps meaning what it
 * meant when it ran.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190001_create_delivery_tables',

  async up({ builder }) {
    await builder.createCollection('deliveryProjects', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('managerId', { length: 64 }).nullable();
      collection.string('startDate', { length: 10 }).nullable();
      collection.string('endDate', { length: 10 }).nullable();
      collection.string('status', { length: 32 }).notNull().defaultTo('active');
      collection.text('description').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('code');
      collection.index('managerId');
      collection.index('status');
    });

    await builder.createCollection('deliveryProjectMembers', (collection) => {
      collection.increments('id');
      collection.integer('projectId').notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.string('role', { length: 32 }).notNull().defaultTo('member');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique(['projectId', 'userId']);
      collection.index('userId');
      collection.index('projectId');
    });

    await builder.createCollection('deliveryMilestones', (collection) => {
      collection.increments('id');
      collection.integer('projectId').notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('dueDate', { length: 10 }).nullable();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection.text('description').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('projectId');
      collection.index('status');
    });

    await builder.createCollection('deliveryTasks', (collection) => {
      collection.increments('id');
      collection.integer('milestoneId').notNull();
      collection.integer('projectId').notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.string('assigneeId', { length: 64 }).nullable();
      collection
        .string('priority', { length: 16 })
        .notNull()
        .defaultTo('medium');
      collection.string('planDate', { length: 10 }).nullable();
      collection.string('actualDate', { length: 10 }).nullable();
      collection.string('status', { length: 32 }).notNull().defaultTo('todo');
      collection.text('description').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('milestoneId');
      collection.index('projectId');
      collection.index('assigneeId');
      collection.index('status');
    });

    await builder.createCollection('deliveryTaskResults', (collection) => {
      collection.increments('id');
      collection.integer('taskId').notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('taskId');
    });

    await builder.createCollection(
      'deliveryTaskResultVersions',
      (collection) => {
        collection.increments('id');
        collection.integer('resultId').notNull();
        collection.integer('versionNo').notNull();
        collection.text('note').nullable();
        collection.string('createdById', { length: 64 }).nullable();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.unique(['resultId', 'versionNo']);
        collection.index('resultId');
      },
    );

    await builder.createCollection(
      'deliveryTaskResultVersionFiles',
      (collection) => {
        collection.increments('id');
        collection.integer('versionId').notNull();
        collection.string('fileId', { length: 36 }).notNull();
        collection.integer('sortOrder').notNull().defaultTo(0);
        collection.datetime('createdAt').notNull();
        collection.index('versionId');
        collection.index('fileId');
      },
    );

    await builder.createCollection('deliveryMaterials', (collection) => {
      collection.increments('id');
      collection.integer('projectId').notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('note').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('projectId');
    });

    await builder.createCollection('deliveryMaterialFiles', (collection) => {
      collection.increments('id');
      collection.integer('materialId').notNull();
      collection.string('fileId', { length: 36 }).notNull();
      collection.integer('sortOrder').notNull().defaultTo(0);
      collection.datetime('createdAt').notNull();
      collection.index('materialId');
      collection.index('fileId');
    });

    await builder.createCollection('deliverySubmissions', (collection) => {
      collection.increments('id');
      collection.integer('projectId').notNull();
      collection.integer('milestoneId').notNull();
      collection.string('applicantId', { length: 64 }).notNull();
      collection.string('reviewerId', { length: 64 }).notNull();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('pending');
      collection.text('note').nullable();
      collection.integer('previousSubmissionId').nullable();
      collection.integer('round').notNull().defaultTo(1);
      collection.datetime('decidedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('projectId');
      collection.index('milestoneId');
      collection.index('reviewerId');
      collection.index('status');
    });

    await builder.createCollection('deliverySubmissionItems', (collection) => {
      collection.increments('id');
      collection.integer('submissionId').notNull();
      collection.integer('resultVersionId').notNull();
      collection.datetime('createdAt').notNull();
      collection.index('submissionId');
      collection.index('resultVersionId');
    });

    await builder.createCollection(
      'deliverySubmissionComments',
      (collection) => {
        collection.increments('id');
        collection.integer('submissionId').notNull();
        collection.string('authorId', { length: 64 }).notNull();
        collection.string('action', { length: 32 }).notNull();
        collection.text('content').nullable();
        collection.datetime('createdAt').notNull();
        collection.index('submissionId');
      },
    );

    // The fixed file columns the File Repository requires. Business ownership
    // lives in the link tables above; a stored file carries no project id.
    await builder.createCollection('deliveryFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.integer('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });
  },

  async down({ builder }) {
    await builder.dropCollection('deliveryFiles');
    await builder.dropCollection('deliverySubmissionComments');
    await builder.dropCollection('deliverySubmissionItems');
    await builder.dropCollection('deliverySubmissions');
    await builder.dropCollection('deliveryMaterialFiles');
    await builder.dropCollection('deliveryMaterials');
    await builder.dropCollection('deliveryTaskResultVersionFiles');
    await builder.dropCollection('deliveryTaskResultVersions');
    await builder.dropCollection('deliveryTaskResults');
    await builder.dropCollection('deliveryTasks');
    await builder.dropCollection('deliveryMilestones');
    await builder.dropCollection('deliveryProjectMembers');
    await builder.dropCollection('deliveryProjects');
  },
});

export default migration;

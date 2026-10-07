import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Task-and-deliverable project collaboration.
 *
 * The tables are declared here in full rather than derived from a shared definition: a migration is immutable
 * history, so it must keep meaning what it meant the day it ran. User columns hold the account id as a plain
 * string, because accounts are owned by the authentication plugin on its own connection and a cross-plugin
 * foreign key would couple this history to that package's schema.
 */
const migration: MigrationDefinition = defineMigration({
  name: '20260115090001_create_project_collaboration',

  async up({ builder }) {
    await builder.createCollection('projects', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('name', { length: 200 }).notNull();
      collection.text('description').nullable();
      collection.string('status', { length: 32 }).notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.date('startDate').nullable();
      collection.date('endDate').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('ownerId');
      collection.index('status');
    });

    await builder.createCollection('project_members', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('projectId', { length: 64 }).notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.string('role', { length: 32 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique(['projectId', 'userId']);
      collection.foreignKey('projectId', {
        references: { collection: 'projects', fields: ['id'] },
        name: 'fk_project_members_project',
        onDelete: 'cascade',
      });
    });

    await builder.createCollection('milestones', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('projectId', { length: 64 }).notNull();
      collection.string('name', { length: 200 }).notNull();
      collection.text('description').nullable();
      collection.date('dueDate').nullable();
      collection.string('status', { length: 32 }).notNull();
      collection.integer('position', { nullable: false, defaultValue: 0 });
      collection.datetime('completedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('projectId');
      collection.foreignKey('projectId', {
        references: { collection: 'projects', fields: ['id'] },
        name: 'fk_milestones_project',
        onDelete: 'cascade',
      });
    });

    await builder.createCollection('tasks', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('projectId', { length: 64 }).notNull();
      collection.string('milestoneId', { length: 64 }).nullable();
      collection.string('title', { length: 200 }).notNull();
      collection.text('description').nullable();
      collection.string('assigneeId', { length: 64 }).nullable();
      collection.string('status', { length: 32 }).notNull();
      collection.string('priority', { length: 16 }).notNull();
      collection.date('dueDate').nullable();
      collection.boolean('required', { nullable: false, defaultValue: true });
      collection.datetime('completedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('projectId');
      collection.index('milestoneId');
      collection.index('assigneeId');
      collection.foreignKey('projectId', {
        references: { collection: 'projects', fields: ['id'] },
        name: 'fk_tasks_project',
        onDelete: 'cascade',
      });
      collection.foreignKey('milestoneId', {
        references: { collection: 'milestones', fields: ['id'] },
        name: 'fk_tasks_milestone',
        onDelete: 'set null',
      });
    });

    await builder.createCollection('deliverables', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('taskId', { length: 64 }).notNull();
      collection.string('projectId', { length: 64 }).notNull();
      collection.string('submitterId', { length: 64 }).notNull();
      collection.string('title', { length: 200 }).notNull();
      collection.text('description').nullable();
      collection.string('status', { length: 32 }).notNull();
      collection.text('rejectReason').nullable();
      collection.string('reviewerId', { length: 64 }).nullable();
      collection.datetime('reviewedAt').nullable();
      collection.string('fileId', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('taskId');
      collection.index('projectId');
      collection.foreignKey('taskId', {
        references: { collection: 'tasks', fields: ['id'] },
        name: 'fk_deliverables_task',
        onDelete: 'cascade',
      });
      collection.foreignKey('projectId', {
        references: { collection: 'projects', fields: ['id'] },
        name: 'fk_deliverables_project',
        onDelete: 'cascade',
      });
    });

    await builder.createCollection('deliverable_shares', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('deliverableId', { length: 64 }).notNull();
      collection.string('sharedWithId', { length: 64 }).notNull();
      collection.string('sharedById', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique(['deliverableId', 'sharedWithId']);
      collection.foreignKey('deliverableId', {
        references: { collection: 'deliverables', fields: ['id'] },
        name: 'fk_deliverable_shares_deliverable',
        onDelete: 'cascade',
      });
    });

    // The file plugin's fixed column contract: uploads compose every value, so extra required columns are not
    // allowed here. `fileId` on `deliverables` links a submission to its stored object.
    await builder.createCollection('deliverable_files', (collection) => {
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
  },

  async down({ builder }) {
    await builder.dropCollection('deliverable_shares');
    await builder.dropCollection('deliverables');
    await builder.dropCollection('tasks');
    await builder.dropCollection('milestones');
    await builder.dropCollection('project_members');
    await builder.dropCollection('projects');
    await builder.dropCollection('deliverable_files');
  },
});

export default migration;

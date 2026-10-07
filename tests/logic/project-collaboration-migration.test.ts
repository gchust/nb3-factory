// @vitest-environment node

import { fileURLToPath } from 'node:url';

import { describeMigration } from '@nocobase/app-testing/server';

/**
 * The collaboration schema against a real test database.
 *
 * `describeMigration` applies the migrations that came before this one, applies this one, asserts the schema, rolls it
 * back, checks that the rollback restored every table as it was, and applies it again. The callbacks below state what
 * this migration is expected to produce and what its `down` is expected to remove.
 */
const migrationsDirectory = fileURLToPath(
  new URL('../../database/main/migrations', import.meta.url),
);

describeMigration('20260115090001_create_project_collaboration', {
  sources: [{ packageName: 'nb3-factory', directory: migrationsDirectory }],

  async up({ expectCollection }) {
    const projects = expectCollection('projects');
    await projects.toExist();
    await projects.toHaveField('id');
    await projects.toHaveField('name', { nullable: false });
    await projects.toHaveField('status', { nullable: false });
    await projects.toHaveField('ownerId', { nullable: false });
    await projects.toHaveField('startDate', { nullable: true });
    await projects.toHaveField('endDate', { nullable: true });
    await projects.toHaveField('createdAt', { nullable: false });
    await projects.toHaveField('updatedAt', { nullable: false });
    await projects.toHaveIndex(['ownerId']);
    await projects.toHaveIndex(['status']);

    const members = expectCollection('project_members');
    await members.toExist();
    await members.toHaveField('projectId', { nullable: false });
    await members.toHaveField('userId', { nullable: false });
    await members.toHaveField('role', { nullable: false });
    await members.toHaveIndex(['projectId', 'userId'], { unique: true });
    await members.toHaveForeignKey(['projectId'], 'projects', {
      onDelete: 'cascade',
    });

    const milestones = expectCollection('milestones');
    await milestones.toExist();
    await milestones.toHaveField('projectId', { nullable: false });
    await milestones.toHaveField('name', { nullable: false });
    await milestones.toHaveField('status', { nullable: false });
    await milestones.toHaveField('position', { nullable: false });
    await milestones.toHaveField('completedAt', { nullable: true });
    await milestones.toHaveIndex(['projectId']);
    await milestones.toHaveForeignKey(['projectId'], 'projects', {
      onDelete: 'cascade',
    });

    const tasks = expectCollection('tasks');
    await tasks.toExist();
    await tasks.toHaveField('projectId', { nullable: false });
    // A task may sit outside a milestone, and loses its milestone rather than itself if that milestone is deleted.
    await tasks.toHaveField('milestoneId', { nullable: true });
    await tasks.toHaveField('assigneeId', { nullable: true });
    await tasks.toHaveField('status', { nullable: false });
    await tasks.toHaveField('priority', { nullable: false });
    await tasks.toHaveField('required', { nullable: false });
    await tasks.toHaveField('completedAt', { nullable: true });
    await tasks.toHaveIndex(['projectId']);
    await tasks.toHaveIndex(['milestoneId']);
    await tasks.toHaveIndex(['assigneeId']);
    await tasks.toHaveForeignKey(['projectId'], 'projects', {
      onDelete: 'cascade',
    });
    await tasks.toHaveForeignKey(['milestoneId'], 'milestones', {
      onDelete: 'set null',
    });

    const deliverables = expectCollection('deliverables');
    await deliverables.toExist();
    await deliverables.toHaveField('taskId', { nullable: false });
    await deliverables.toHaveField('projectId', { nullable: false });
    await deliverables.toHaveField('submitterId', { nullable: false });
    await deliverables.toHaveField('status', { nullable: false });
    await deliverables.toHaveField('rejectReason', { nullable: true });
    await deliverables.toHaveField('reviewerId', { nullable: true });
    await deliverables.toHaveField('fileId', { nullable: true });
    await deliverables.toHaveIndex(['taskId']);
    await deliverables.toHaveIndex(['projectId']);
    await deliverables.toHaveForeignKey(['taskId'], 'tasks', {
      onDelete: 'cascade',
    });
    await deliverables.toHaveForeignKey(['projectId'], 'projects', {
      onDelete: 'cascade',
    });

    const shares = expectCollection('deliverable_shares');
    await shares.toExist();
    await shares.toHaveField('sharedWithId', { nullable: false });
    await shares.toHaveField('sharedById', { nullable: false });
    await shares.toHaveIndex(['deliverableId', 'sharedWithId'], {
      unique: true,
    });
    await shares.toHaveForeignKey(['deliverableId'], 'deliverables', {
      onDelete: 'cascade',
    });

    const files = expectCollection('deliverable_files');
    await files.toExist();
    await files.toHaveField('disk', { nullable: false });
    await files.toHaveField('key', { nullable: false });
    await files.toHaveField('filename', { nullable: false });
    await files.toHaveField('ext', { nullable: false });
    await files.toHaveField('mimeType', { nullable: false });
    await files.toHaveField('size', { nullable: false });
  },

  async down({ expectCollection }) {
    // A dependent table has to go before the tables it references; the migration drops them in that order.
    await expectCollection('deliverable_shares').not.toExist();
    await expectCollection('deliverables').not.toExist();
    await expectCollection('tasks').not.toExist();
    await expectCollection('milestones').not.toExist();
    await expectCollection('project_members').not.toExist();
    await expectCollection('projects').not.toExist();
    await expectCollection('deliverable_files').not.toExist();
  },
});

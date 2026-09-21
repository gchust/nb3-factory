import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Customer project delivery and acceptance schema.
 *
 * A customer owns projects; a project is delivered through milestones; each
 * milestone holds delivery tasks that must be completed and submitted for
 * acceptance as batches; an approved acceptance produces the settlement basis
 * that finance reads.
 *
 * Money is stored as an integer number of minor units (`amountCents`) so that
 * milestone allocation, settlement totals and payment reconciliation stay exact
 * instead of drifting through floating point rounding.
 *
 * The migration is immutable history: every field, index and constraint is
 * spelled out here and nothing is imported from a definition that keeps
 * evolving.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609200001_create_project_delivery_schema',

  async up({ builder }) {
    await builder.createCollection('deliveryCustomers', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 32, nullable: false });
      collection.string('name', { length: 200, nullable: false });
      collection.string('industry', { length: 100, nullable: true });
      collection.string('level', { length: 32, nullable: true });
      collection.string('ownerId', { length: 64, nullable: true });
      collection.text('note', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('code');
      collection.index('name');
      collection.index('ownerId');
    });

    await builder.createCollection('deliveryContacts', (collection) => {
      collection.increments('id');
      collection.integer('customerId', { nullable: false });
      collection.string('name', { length: 120, nullable: false });
      collection.string('title', { length: 120, nullable: true });
      collection.string('phone', { length: 60, nullable: true });
      collection.string('email', { length: 200, nullable: true });
      collection.boolean('isPrimary', { nullable: false, defaultValue: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('customerId');
    });

    // A project is the unit customers are scoped to: a customer may only read
    // the projects it owns and the files attached to them.
    await builder.createCollection('deliveryProjects', (collection) => {
      collection.increments('id');
      collection.string('contractNo', { length: 64, nullable: false });
      collection.string('title', { length: 200, nullable: false });
      collection.integer('customerId', { nullable: false });
      collection.integer('amountCents', { nullable: false, defaultValue: 0 });
      collection.string('currency', {
        length: 8,
        nullable: false,
        defaultValue: 'CNY',
      });
      collection.date('startDate', { nullable: false });
      collection.date('endDate', { nullable: false });
      collection.string('managerId', { length: 64, nullable: true });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'draft',
      });
      collection.text('note', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('contractNo');
      collection.index('customerId');
      collection.index('managerId');
      collection.index('status');
      collection.index('endDate');
    });

    await builder.createCollection('deliveryProjectMembers', (collection) => {
      collection.increments('id');
      collection.integer('projectId', { nullable: false });
      collection.string('userId', { length: 64, nullable: false });
      collection.string('memberRole', { length: 32, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['projectId', 'userId']);
      collection.index('userId');
    });

    await builder.createCollection('deliveryChangeRecords', (collection) => {
      collection.increments('id');
      collection.integer('projectId', { nullable: false });
      collection.string('changeType', { length: 32, nullable: false });
      collection.text('summary', { nullable: false });
      collection.string('beforeValue', { length: 200, nullable: true });
      collection.string('afterValue', { length: 200, nullable: true });
      collection.string('createdById', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('projectId');
    });

    await builder.createCollection('deliveryMilestones', (collection) => {
      collection.increments('id');
      collection.integer('projectId', { nullable: false });
      collection.string('name', { length: 200, nullable: false });
      collection.integer('seq', { nullable: false, defaultValue: 1 });
      collection.date('dueDate', { nullable: false });
      collection.string('ownerId', { length: 64, nullable: true });
      collection.string('acceptorId', { length: 64, nullable: true });
      collection.integer('amountCents', { nullable: false, defaultValue: 0 });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'pending',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('projectId');
      collection.index('dueDate');
      collection.index('acceptorId');
      collection.index('status');
    });

    // Work items an implementation consultant maintains. `required` marks the
    // tasks that must all reach `done` before an acceptance batch may be
    // submitted.
    await builder.createCollection('deliveryTasks', (collection) => {
      collection.increments('id');
      collection.integer('milestoneId', { nullable: false });
      collection.string('name', { length: 200, nullable: false });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'todo',
      });
      collection.boolean('required', { nullable: false, defaultValue: true });
      collection.string('assigneeId', { length: 64, nullable: true });
      collection.integer('currentVersion', {
        nullable: false,
        defaultValue: 0,
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('milestoneId');
      collection.index('status');
      collection.index('assigneeId');
    });

    await builder.createCollection(
      'deliveryAcceptanceBatches',
      (collection) => {
        collection.increments('id');
        collection.integer('taskId', { nullable: false });
        collection.integer('versionNo', { nullable: false });
        collection.string('status', {
          length: 32,
          nullable: false,
          defaultValue: 'pending_review',
        });
        collection.text('note', { nullable: true });
        collection.string('submittedById', { length: 64, nullable: true });
        collection.datetime('submittedAt', { nullable: true });
        collection.string('reviewerId', { length: 64, nullable: true });
        collection.datetime('reviewedAt', { nullable: true });
        collection.text('reviewComment', { nullable: true });
        collection.datetime('createdAt', { nullable: false });
        collection.datetime('updatedAt', { nullable: false });
        collection.unique(['taskId', 'versionNo']);
        collection.index('status');
      },
    );

    await builder.createCollection('deliveryIssues', (collection) => {
      collection.increments('id');
      collection.integer('projectId', { nullable: false });
      collection.integer('milestoneId', { nullable: true });
      collection.integer('taskId', { nullable: true });
      collection.string('title', { length: 200, nullable: false });
      collection.text('description', { nullable: true });
      collection.string('severity', {
        length: 32,
        nullable: false,
        defaultValue: 'medium',
      });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'open',
      });
      collection.string('ownerId', { length: 64, nullable: true });
      collection.text('resolution', { nullable: true });
      collection.string('createdById', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('projectId');
      collection.index('status');
      collection.index('severity');
    });

    await builder.createCollection('deliverySettlements', (collection) => {
      collection.increments('id');
      collection.integer('projectId', { nullable: false });
      collection.integer('milestoneId', { nullable: false });
      collection.integer('amountCents', { nullable: false, defaultValue: 0 });
      collection.integer('receivedCents', { nullable: false, defaultValue: 0 });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'unpaid',
      });
      collection.string('confirmedById', { length: 64, nullable: true });
      collection.datetime('confirmedAt', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('milestoneId');
      collection.index('projectId');
      collection.index('status');
    });

    await builder.createCollection(
      'deliverySettlementPayments',
      (collection) => {
        collection.increments('id');
        collection.integer('settlementId', { nullable: false });
        collection.integer('amountCents', { nullable: false });
        collection.date('receivedAt', { nullable: false });
        collection.string('method', {
          length: 32,
          nullable: false,
          defaultValue: 'transfer',
        });
        collection.text('note', { nullable: true });
        collection.string('createdById', { length: 64, nullable: true });
        collection.datetime('createdAt', { nullable: false });
        collection.datetime('updatedAt', { nullable: false });
        collection.index('settlementId');
      },
    );

    await builder.createCollection('deliveryRoleAssignments', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 64, nullable: false });
      collection.string('role', { length: 32, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['userId', 'role']);
      collection.index('role');
    });

    await builder.createCollection('deliveryFileLinks', (collection) => {
      collection.increments('id');
      collection.string('fileKind', { length: 32, nullable: false });
      collection.string('fileId', { length: 64, nullable: false });
      collection.string('targetType', { length: 32, nullable: false });
      collection.integer('targetId', { nullable: false });
      collection.string('createdById', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index(['fileKind', 'fileId']);
      collection.index(['targetType', 'targetId']);
    });
  },

  async down({ builder }) {
    await builder.dropCollection('deliveryFileLinks');
    await builder.dropCollection('deliveryRoleAssignments');
    await builder.dropCollection('deliverySettlementPayments');
    await builder.dropCollection('deliverySettlements');
    await builder.dropCollection('deliveryIssues');
    await builder.dropCollection('deliveryAcceptanceBatches');
    await builder.dropCollection('deliveryTasks');
    await builder.dropCollection('deliveryMilestones');
    await builder.dropCollection('deliveryChangeRecords');
    await builder.dropCollection('deliveryProjectMembers');
    await builder.dropCollection('deliveryProjects');
    await builder.dropCollection('deliveryContacts');
    await builder.dropCollection('deliveryCustomers');
  },
});

export default migration;

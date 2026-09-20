import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Contract delivery and acceptance schema.
 *
 * Money is stored as an integer number of minor units (`amountCents`) so that
 * milestone allocation, receivable totals and payment reconciliation stay exact
 * instead of drifting through floating point rounding.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609200001_create_contract_delivery_schema',

  async up({ builder }) {
    await builder.createCollection('cdCustomers', (collection) => {
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

    await builder.createCollection('cdContacts', (collection) => {
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

    await builder.createCollection('cdContracts', (collection) => {
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

    await builder.createCollection('cdContractMembers', (collection) => {
      collection.increments('id');
      collection.integer('contractId', { nullable: false });
      collection.string('userId', { length: 64, nullable: false });
      collection.string('memberRole', { length: 32, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['contractId', 'userId']);
      collection.index('userId');
    });

    await builder.createCollection('cdContractChanges', (collection) => {
      collection.increments('id');
      collection.integer('contractId', { nullable: false });
      collection.string('changeType', { length: 32, nullable: false });
      collection.text('summary', { nullable: false });
      collection.string('beforeValue', { length: 200, nullable: true });
      collection.string('afterValue', { length: 200, nullable: true });
      collection.string('createdById', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('contractId');
    });

    await builder.createCollection('cdMilestones', (collection) => {
      collection.increments('id');
      collection.integer('contractId', { nullable: false });
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
      collection.index('contractId');
      collection.index('dueDate');
      collection.index('acceptorId');
      collection.index('status');
    });

    await builder.createCollection('cdDeliverables', (collection) => {
      collection.increments('id');
      collection.integer('milestoneId', { nullable: false });
      collection.string('name', { length: 200, nullable: false });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'draft',
      });
      collection.integer('currentVersion', {
        nullable: false,
        defaultValue: 0,
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('milestoneId');
    });

    await builder.createCollection('cdDeliverableVersions', (collection) => {
      collection.increments('id');
      collection.integer('deliverableId', { nullable: false });
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
      collection.unique(['deliverableId', 'versionNo']);
      collection.index('status');
    });

    await builder.createCollection('cdReceivables', (collection) => {
      collection.increments('id');
      collection.integer('contractId', { nullable: false });
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
      collection.index('contractId');
      collection.index('status');
    });

    await builder.createCollection('cdPayments', (collection) => {
      collection.increments('id');
      collection.integer('receivableId', { nullable: false });
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
      collection.index('receivableId');
    });

    await builder.createCollection('cdRoleAssignments', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 64, nullable: false });
      collection.string('role', { length: 32, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique(['userId', 'role']);
      collection.index('role');
    });

    await builder.createCollection('cdFileLinks', (collection) => {
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
    await builder.dropCollection('cdFileLinks');
    await builder.dropCollection('cdRoleAssignments');
    await builder.dropCollection('cdPayments');
    await builder.dropCollection('cdReceivables');
    await builder.dropCollection('cdDeliverableVersions');
    await builder.dropCollection('cdDeliverables');
    await builder.dropCollection('cdMilestones');
    await builder.dropCollection('cdContractChanges');
    await builder.dropCollection('cdContractMembers');
    await builder.dropCollection('cdContracts');
    await builder.dropCollection('cdContacts');
    await builder.dropCollection('cdCustomers');
  },
});

export default migration;

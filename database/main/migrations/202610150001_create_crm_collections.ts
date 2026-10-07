import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The CRM tables: customers, their contacts, opportunities and follow-up
 * records, plus the assistant's pending suggestions.
 *
 * Every business table carries its own `ownerId` so record-level ownership can
 * be enforced uniformly: a sales representative owns the customers they are
 * responsible for, and the contacts, opportunities and follow-ups recorded
 * against them inherit that owner.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610150001_create_crm_collections',
  async up({ builder }) {
    await builder.createCollection('crmCustomers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 200, nullable: false });
      collection.string('ownerId', { length: 64, nullable: false });
      collection.string('industry', { length: 100 });
      collection.enum('level', {
        values: ['A', 'B', 'C'],
        defaultValue: 'B',
        nullable: false,
      });
      collection.string('phone', { length: 50 });
      collection.string('email', { length: 200 });
      collection.string('website', { length: 300 });
      collection.string('address', { length: 500 });
      collection.string('source', { length: 100 });
      collection.text('notes');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('ownerId');
      collection.index('name');
      collection.index('level');
    });

    await builder.createCollection('crmContacts', (collection) => {
      collection.increments('id');
      collection.integer('customerId', { nullable: false });
      collection.string('ownerId', { length: 64, nullable: false });
      collection.string('name', { length: 200, nullable: false });
      collection.string('position', { length: 100 });
      collection.string('phone', { length: 50 });
      collection.string('email', { length: 200 });
      collection.boolean('isPrimary', { defaultValue: false, nullable: false });
      collection.text('notes');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('customerId');
      collection.index('ownerId');
      collection.foreignKey(['customerId'], {
        references: { collection: 'crmCustomers', fields: ['id'] },
        onDelete: 'cascade',
      });
    });

    await builder.createCollection('crmOpportunities', (collection) => {
      collection.increments('id');
      collection.integer('customerId', { nullable: false });
      collection.string('ownerId', { length: 64, nullable: false });
      collection.string('name', { length: 200, nullable: false });
      collection.enum('stage', {
        values: ['initial_contact', 'quote', 'won', 'lost'],
        defaultValue: 'initial_contact',
        nullable: false,
      });
      collection.decimal('amount', {
        precision: 14,
        scale: 2,
        nullable: false,
        defaultValue: '0',
      });
      collection.date('expectedCloseDate');
      collection.string('lostReason', { length: 500 });
      collection.text('notes');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('customerId');
      collection.index('ownerId');
      collection.index('stage');
      collection.foreignKey(['customerId'], {
        references: { collection: 'crmCustomers', fields: ['id'] },
        onDelete: 'cascade',
      });
    });

    await builder.createCollection('crmFollowUps', (collection) => {
      collection.increments('id');
      collection.integer('customerId', { nullable: false });
      collection.integer('opportunityId');
      collection.string('ownerId', { length: 64, nullable: false });
      collection.enum('method', {
        values: ['call', 'visit', 'email', 'wechat', 'other'],
        defaultValue: 'call',
        nullable: false,
      });
      collection.text('content');
      collection.enum('status', {
        values: ['pending', 'done', 'cancelled'],
        defaultValue: 'pending',
        nullable: false,
      });
      collection.datetime('dueAt');
      collection.datetime('completedAt');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('customerId');
      collection.index('opportunityId');
      collection.index('ownerId');
      collection.index('status');
      collection.index('dueAt');
      collection.foreignKey(['customerId'], {
        references: { collection: 'crmCustomers', fields: ['id'] },
        onDelete: 'cascade',
      });
      collection.foreignKey(['opportunityId'], {
        references: { collection: 'crmOpportunities', fields: ['id'] },
        onDelete: 'set null',
      });
    });

    // The assistant writes one row per suggestion it surfaces. A pending row is
    // inert until a supervisor approves it and the follow-up task is created.
    await builder.createCollection('crmSuggestions', (collection) => {
      collection.increments('id');
      collection.integer('customerId', { nullable: false });
      collection.integer('opportunityId');
      collection.integer('followUpId');
      collection.enum('kind', {
        values: [
          'overdue_followup',
          'stalled_opportunity',
          'high_value_opportunity',
          'idle_customer',
        ],
        nullable: false,
      });
      collection.string('title', { length: 300, nullable: false });
      collection.text('detail');
      collection.enum('status', {
        values: ['pending', 'approved', 'dismissed'],
        defaultValue: 'pending',
        nullable: false,
      });
      collection.string('decidedById', { length: 64 });
      collection.datetime('decidedAt');
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('customerId');
      collection.index('status');
      collection.index('kind');
      collection.foreignKey(['customerId'], {
        references: { collection: 'crmCustomers', fields: ['id'] },
        onDelete: 'cascade',
      });
      collection.foreignKey(['opportunityId'], {
        references: { collection: 'crmOpportunities', fields: ['id'] },
        onDelete: 'set null',
      });
      collection.foreignKey(['followUpId'], {
        references: { collection: 'crmFollowUps', fields: ['id'] },
        onDelete: 'set null',
      });
    });
  },
  async down({ builder }) {
    // Drop the dependents first: their foreign keys reference the business tables.
    await builder.dropCollection('crmSuggestions');
    await builder.dropCollection('crmFollowUps');
    await builder.dropCollection('crmOpportunities');
    await builder.dropCollection('crmContacts');
    await builder.dropCollection('crmCustomers');
  },
});

export default migration;

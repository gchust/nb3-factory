import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Sales CRM tables.
 *
 * The structure is spelled out here in full so this migration keeps meaning the
 * same thing after it has been applied. It intentionally imports no runtime
 * collection definition.
 *
 * `crmFiles` is a File plugin collection: its columns are fixed by the plugin
 * (id/disk/key/filename/ext/mimeType/size/createdAt/updatedAt) and must not be
 * extended with business columns. Business ownership lives in `crmAttachments`.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130001_create_crm_tables',

  async up({ builder }) {
    await builder.createCollection('crmCustomers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.string('industry', { length: 64, nullable: true });
      collection.string('companySize', { length: 32, nullable: true });
      collection.string('source', { length: 32, nullable: true });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'potential',
      });
      collection.string('ownerId', { length: 64, nullable: false });
      collection.text('notes', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('ownerId');
      collection.index('status');
    });

    await builder.createCollection('crmContacts', (collection) => {
      collection.increments('id');
      collection.integer('customerId', { nullable: false });
      collection.string('name', { length: 255, nullable: false });
      collection.string('title', { length: 128, nullable: true });
      collection.string('phone', { length: 64, nullable: true });
      collection.string('email', { length: 255, nullable: true });
      collection.boolean('isPrimary', { nullable: false, defaultValue: false });
      collection.string('ownerId', { length: 64, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('customerId');
      collection.index('ownerId');
    });

    await builder.createCollection('crmOpportunities', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255, nullable: false });
      collection.integer('customerId', { nullable: false });
      collection.decimal('amount', { precision: 14, scale: 2, nullable: true });
      collection.string('stage', {
        length: 32,
        nullable: false,
        defaultValue: 'lead',
      });
      collection.datetime('expectedCloseDate', { nullable: true });
      collection.string('ownerId', { length: 64, nullable: false });
      collection.decimal('wonAmount', {
        precision: 14,
        scale: 2,
        nullable: true,
      });
      collection.text('lostReason', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('customerId');
      collection.index('stage');
      collection.index('ownerId');
    });

    await builder.createCollection('crmFollowUps', (collection) => {
      collection.increments('id');
      collection.integer('customerId', { nullable: true });
      collection.integer('opportunityId', { nullable: true });
      collection.string('method', { length: 32, nullable: false });
      collection.text('summary', { nullable: false });
      collection.text('nextStep', { nullable: true });
      collection.datetime('followedAt', { nullable: false });
      collection.string('ownerId', { length: 64, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('customerId');
      collection.index('opportunityId');
      collection.index('ownerId');
    });

    await builder.createCollection('crmFiles', (collection) => {
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

    await builder.createCollection('crmAttachments', (collection) => {
      collection.increments('id');
      collection.string('targetType', { length: 16, nullable: false });
      collection.integer('targetId', { nullable: false });
      collection.string('fileId', { length: 36, nullable: false });
      collection.string('ownerId', { length: 64, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.index(['targetType', 'targetId']);
      collection.index('ownerId');
      collection.index('fileId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('crmAttachments');
    await builder.dropCollection('crmFiles');
    await builder.dropCollection('crmFollowUps');
    await builder.dropCollection('crmOpportunities');
    await builder.dropCollection('crmContacts');
    await builder.dropCollection('crmCustomers');
  },
});

export default migration;

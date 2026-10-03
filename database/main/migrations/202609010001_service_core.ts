import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609010001_service_core',
  async up({ builder }) {
    await builder.createCollection('customers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 191, nullable: false });
      collection.string('contactName', { length: 191, nullable: true });
      collection.string('contactPhone', { length: 64, nullable: true });
      collection.text('address', { nullable: true });
      collection.text('note', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('name');
    });

    await builder.createCollection('engineerGroups', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 32, nullable: false }).unique({
        name: 'uq_engineer_groups_code',
      });
      collection.string('name', { length: 191, nullable: false });
      collection.text('description', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });

    await builder.createCollection('engineerProfiles', (collection) => {
      collection.increments('id');
      collection.string('username', { length: 191, nullable: false }).unique({
        name: 'uq_engineer_profiles_username',
      });
      collection.string('displayName', { length: 191, nullable: true });
      collection.enum('appRole', {
        values: ['supervisor', 'engineer', 'observer', 'integration'],
        nullable: false,
      });
      collection.string('userId', { length: 64, nullable: true }).unique({
        name: 'uq_engineer_profiles_user',
      });
      collection.integer('groupId', { nullable: true });
      collection.boolean('enabled', { nullable: false, defaultValue: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.foreignKey('groupId', {
        references: { collection: 'engineerGroups', fields: ['id'] },
        name: 'fk_engineer_profiles_group',
        onDelete: 'set null',
      });
    });

    await builder.createCollection('devices', (collection) => {
      collection.increments('id');
      collection.string('deviceNo', { length: 191, nullable: false }).unique({
        name: 'uq_devices_deviceNo',
      });
      collection.string('name', { length: 191, nullable: false });
      collection.integer('customerId', { nullable: false });
      collection.integer('engineerProfileId', { nullable: true });
      collection.string('serviceEngineerId', { length: 64, nullable: true });
      collection.enum('status', {
        values: ['active', 'maintenance', 'disabled'],
        nullable: false,
        defaultValue: 'active',
      });
      collection.date('nextInspectionDate', { nullable: true });
      collection.string('model', { length: 191, nullable: true });
      collection.string('location', { length: 191, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.foreignKey('customerId', {
        references: { collection: 'customers', fields: ['id'] },
        name: 'fk_devices_customer',
        onDelete: 'restrict',
      });
      collection.foreignKey('engineerProfileId', {
        references: { collection: 'engineerProfiles', fields: ['id'] },
        name: 'fk_devices_engineer_profile',
        onDelete: 'set null',
      });
      collection.index('status');
      collection.index('nextInspectionDate');
    });

    await builder.createCollection('knowledgeArticles', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 191, nullable: false });
      collection.text('body', { nullable: true });
      collection.enum('status', {
        values: ['draft', 'published'],
        nullable: false,
        defaultValue: 'draft',
      });
      collection.string('createdById', { length: 64, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('status');
    });
  },
  async down({ builder }) {
    await builder.dropCollection('knowledgeArticles');
    await builder.dropCollection('devices');
    await builder.dropCollection('engineerProfiles');
    await builder.dropCollection('engineerGroups');
    await builder.dropCollection('customers');
  },
});

export default migration;

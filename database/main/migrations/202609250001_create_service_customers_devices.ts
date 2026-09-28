import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Core after-sales directory: customers, their devices, and the engineer group
 * directory used by the dashboard workload counters.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609250001_create_service_customers_devices',

  async up({ builder }) {
    await builder.createCollection('serviceCustomers', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128, nullable: false });
      collection.string('contactName', { length: 64, nullable: true });
      collection.string('contactPhone', { length: 64, nullable: true });
      collection.string('contactEmail', { length: 128, nullable: true });
      collection.string('address', { length: 255, nullable: true });
      collection.text('note', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('name');
    });

    await builder.createCollection('serviceDevices', (collection) => {
      collection.increments('id');
      collection.string('serialNumber', { length: 64, nullable: false });
      collection.string('name', { length: 128, nullable: false });
      collection.string('model', { length: 128, nullable: true });
      collection
        .belongsTo('customer', 'serviceCustomers', {
          targetKey: 'id',
          foreignKeyType: 'integer',
          foreignKey: 'customerId',
        })
        .notNull();
      // A plain user id rather than a relation to the users plugin's `user`
      // collection: application migrations must apply even where that plugin is
      // not part of the runtime, and the users collection keeps evolving.
      collection.string('engineerId', { length: 64, nullable: true });
      collection.boolean('enabled', { nullable: false, defaultValue: true });
      collection.date('installedAt', { nullable: true });
      collection.date('nextInspectionDate', { nullable: true });
      collection.string('location', { length: 255, nullable: true });
      collection.text('note', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('serialNumber');
      collection.index('enabled');
      collection.index('nextInspectionDate');
    });

    // Application-owned engineer directory. The users plugin collection is not
    // extended; a device service team is business data.
    await builder.createCollection('serviceTeamMembers', (collection) => {
      collection.increments('id');
      collection.string('userId', { length: 64, nullable: false });
      collection.string('groupName', { length: 32, nullable: false });
      collection.string('displayName', { length: 128, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('userId', {
        name: 'uniq_service_team_members_user',
        mode: 'constraint',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('serviceTeamMembers');
    await builder.dropCollection('serviceDevices');
    await builder.dropCollection('serviceCustomers');
  },
});

export default migration;

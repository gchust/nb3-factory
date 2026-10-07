import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Customers, service teams and installed devices — the entities every work order,
 * inspection task and manual hangs off.
 *
 * This file is history: it spells out every column, index and constraint itself and
 * never imports a Collection definition from runtime code.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611010001_create_service_core',

  async up({ builder }) {
    await builder.createCollection('customers', (c) => {
      c.string('id', { length: 64 }).notNull();
      c.primary('id');
      c.string('name', { length: 200 }).notNull();
      c.string('code', { length: 64 }).notNull();
      c.string('contactName', { length: 120 }).nullable();
      c.string('contactPhone', { length: 60 }).nullable();
      c.string('contactEmail', { length: 200 }).nullable();
      c.string('address', { length: 500 }).nullable();
      // `vip` | `key` | `normal`
      c.string('level', { length: 32 }).notNull().defaultTo('normal');
      c.text('note').nullable();
      c.datetime('createdAt').notNull();
      c.datetime('updatedAt').notNull();
      c.unique('code');
      c.index('name');
    });

    await builder.createCollection('serviceGroups', (c) => {
      c.string('id', { length: 64 }).notNull();
      c.primary('id');
      c.string('name', { length: 120 }).notNull();
      c.string('code', { length: 64 }).notNull();
      c.string('description', { length: 500 }).nullable();
      c.boolean('active').notNull().defaultTo(true);
      c.datetime('createdAt').notNull();
      c.datetime('updatedAt').notNull();
      c.unique('code');
    });

    // Auth users live in a table this application does not own, so membership is a
    // separate join collection keyed by the user id.
    await builder.createCollection('serviceGroupMembers', (c) => {
      c.string('id', { length: 64 }).notNull();
      c.primary('id');
      c.string('groupId', { length: 64 }).notNull();
      c.string('userId', { length: 64 }).notNull();
      // `supervisor` | `engineer`
      c.string('memberRole', { length: 32 }).notNull().defaultTo('engineer');
      c.boolean('active').notNull().defaultTo(true);
      c.datetime('createdAt').notNull();
      c.datetime('updatedAt').notNull();
      c.unique(['groupId', 'userId']);
      c.index('userId');
      c.index('groupId');
    });

    await builder.createCollection('devices', (c) => {
      c.string('id', { length: 64 }).notNull();
      c.primary('id');
      c.string('code', { length: 64 }).notNull();
      c.string('name', { length: 200 }).notNull();
      c.string('model', { length: 120 }).nullable();
      c.string('serialNumber', { length: 120 }).nullable();
      c.string('customerId', { length: 64 }).notNull();
      // The engineer who owns first-line service for this device.
      c.string('serviceEngineerId', { length: 64 }).nullable();
      c.string('groupId', { length: 64 }).nullable();
      c.string('location', { length: 300 }).nullable();
      c.date('installDate').nullable();
      c.date('warrantyUntil').nullable();
      // The plan date the daily inspection generator reads.
      c.date('nextInspectionDate').nullable();
      c.integer('inspectionCycleDays').notNull().defaultTo(90);
      c.boolean('enabled').notNull().defaultTo(true);
      c.text('note').nullable();
      c.datetime('createdAt').notNull();
      c.datetime('updatedAt').notNull();
      c.unique('code');
      c.index('customerId');
      c.index('serviceEngineerId');
      c.index('nextInspectionDate');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('devices');
    await builder.dropCollection('serviceGroupMembers');
    await builder.dropCollection('serviceGroups');
    await builder.dropCollection('customers');
  },
});

export default migration;

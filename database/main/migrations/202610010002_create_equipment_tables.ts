import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The equipment ledger, its calibration history and the borrowing
 * reservations. `studentVisible` / `studentDescription` are the fields that let
 * a student see that a device exists and what it is for without exposing the
 * full asset record.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610010002_create_equipment_tables',

  async up({ builder }) {
    await builder.createCollection('equipment', (collection) => {
      collection.increments('id');
      collection.string('assetNo', { length: 64, nullable: false });
      collection.string('name', { length: 200, nullable: false });
      collection.string('model', { length: 200, nullable: true });
      collection.string('serialNo', { length: 128, nullable: true });
      collection.string('category', { length: 64, nullable: true });
      collection.integer('labId', { nullable: false });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'available',
      });
      collection.datetime('purchaseDate', { nullable: true });
      collection.string('ownerName', { length: 200, nullable: true });
      collection.text('description', { nullable: true });
      collection.boolean('studentVisible', {
        nullable: false,
        defaultValue: false,
      });
      collection.text('studentDescription', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('assetNo');
      collection.index('labId');
      collection.index('status');
      collection.index('category');
      collection.foreignKey(['labId'], {
        references: { collection: 'laboratories', fields: ['id'] },
        onDelete: 'restrict',
      });
    });

    await builder.createCollection('calibration_records', (collection) => {
      collection.increments('id');
      collection.integer('equipmentId', { nullable: false });
      collection.datetime('calibratedAt', { nullable: false });
      collection.datetime('expiresAt', { nullable: false });
      collection.string('provider', { length: 200, nullable: true });
      collection.string('certificateNo', { length: 128, nullable: true });
      collection.string('result', {
        length: 32,
        nullable: false,
        defaultValue: 'passed',
      });
      collection.text('notes', { nullable: true });
      collection.string('createdById', { length: 191, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('equipmentId');
      collection.index('expiresAt');
      collection.foreignKey(['equipmentId'], {
        references: { collection: 'equipment', fields: ['id'] },
        onDelete: 'cascade',
      });
    });

    await builder.createCollection('equipment_reservations', (collection) => {
      collection.increments('id');
      collection.integer('equipmentId', { nullable: false });
      collection.string('userId', { length: 191, nullable: false });
      collection.datetime('startsAt', { nullable: false });
      collection.datetime('endsAt', { nullable: false });
      collection.text('purpose', { nullable: true });
      collection.string('status', {
        length: 32,
        nullable: false,
        defaultValue: 'reserved',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('equipmentId');
      collection.index('userId');
      collection.index('status');
      collection.foreignKey(['equipmentId'], {
        references: { collection: 'equipment', fields: ['id'] },
        onDelete: 'cascade',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('equipment_reservations');
    await builder.dropCollection('calibration_records');
    await builder.dropCollection('equipment');
  },
});

export default migration;

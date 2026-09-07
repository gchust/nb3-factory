import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * IT asset management: employees, assets and their claim/return records.
 *
 * - itEmployees: people who may claim assets. `isAdmin` marks the asset
 *   administrator who may create, edit and delete assets.
 * - itAssets: the inventory. `currentEmployeeId` is the person currently
 *   holding the asset (null when available). `status` is one of
 *   available | inUse | maintenance | retired.
 * - itAssetRecords: one row per claim; `returnedAt` is null while the asset
 *   is still held, and `status` is claimed | returned.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609010001_create_it_asset_tables',

  async up({ builder }) {
    await builder.createCollection('itEmployees', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 64, nullable: false });
      collection.string('department', { length: 64, nullable: false });
      collection.string('email', { length: 255, nullable: true });
      collection.boolean('isAdmin', { nullable: false, defaultValue: false });
      collection.datetime('createdAt', { nullable: false });
      collection.index('department');
    });

    await builder.createCollection('itAssets', (collection) => {
      collection.increments('id');
      collection.string('assetNumber', { length: 64, nullable: false });
      collection.string('name', { length: 128, nullable: false });
      collection.string('type', { length: 32, nullable: false });
      collection.string('brandModel', { length: 128, nullable: false });
      collection.string('status', { length: 32, nullable: false });
      collection.integer('currentEmployeeId', { nullable: true });
      collection.datetime('purchasedAt', { nullable: true });
      collection.text('remark', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.unique('assetNumber');
      collection.index('type');
      collection.index('status');
      collection.index('currentEmployeeId');
      collection.foreignKey('currentEmployeeId', {
        references: { collection: 'itEmployees', fields: ['id'] },
        onDelete: 'set null',
      });
    });

    await builder.createCollection('itAssetRecords', (collection) => {
      collection.increments('id');
      collection.integer('assetId', { nullable: false });
      collection.integer('employeeId', { nullable: false });
      collection.datetime('claimedAt', { nullable: false });
      collection.datetime('returnedAt', { nullable: true });
      collection.string('status', { length: 32, nullable: false });
      collection.text('remark', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.index('assetId');
      collection.index('employeeId');
      collection.index('status');
      collection.foreignKey('assetId', {
        references: { collection: 'itAssets', fields: ['id'] },
        onDelete: 'cascade',
      });
      collection.foreignKey('employeeId', {
        references: { collection: 'itEmployees', fields: ['id'] },
        onDelete: 'restrict',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('itAssetRecords');
    await builder.dropCollection('itAssets');
    await builder.dropCollection('itEmployees');
  },
});

export default migration;

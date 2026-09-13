import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Asset ledger plus the checkout (assignment) records that track who currently holds each asset.
 *
 * The asset code carries a database unique constraint, so a duplicate is rejected by the storage
 * layer and not only by a pre-check that could race. `it_asset_files` links uploaded `it_files`
 * rows to an asset.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130002_create_it_assets',

  async up({ builder }) {
    await builder.createCollection('it_assets', (collection) => {
      collection.increments('id');
      collection.string('assetCode', { length: 64, nullable: false });
      collection.string('name', { length: 255, nullable: false });
      collection.string('category', { length: 32, nullable: false });
      collection.string('brandModel', { length: 255, nullable: true });
      collection.datetime('purchaseDate', { nullable: true });
      collection.decimal('purchaseAmount', {
        precision: 14,
        scale: 2,
        nullable: true,
      });
      collection.string('status', { length: 32, nullable: false });
      collection.string('currentHolder', { length: 128, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('assetCode', { name: 'uq_it_assets_code' });
      collection.index('category', { name: 'idx_it_assets_category' });
      collection.index('status', { name: 'idx_it_assets_status' });
    });

    await builder.createCollection('it_asset_files', (collection) => {
      collection.increments('id');
      collection.integer('assetId', { nullable: false });
      collection.string('fileId', { length: 36, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.unique(['assetId', 'fileId'], {
        name: 'uq_it_asset_files_pair',
      });
      collection.index('assetId', { name: 'idx_it_asset_files_asset' });
    });

    await builder.createCollection('it_asset_assignments', (collection) => {
      collection.increments('id');
      collection.integer('assetId', { nullable: false });
      collection.string('employeeName', { length: 128, nullable: false });
      collection.datetime('assignedAt', { nullable: false });
      collection.datetime('returnedAt', { nullable: true });
      collection.text('note', { nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('assetId', { name: 'idx_it_assignments_asset' });
      collection.index('returnedAt', { name: 'idx_it_assignments_returned' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('it_asset_assignments');
    await builder.dropCollection('it_asset_files');
    await builder.dropCollection('it_assets');
  },
});

export default migration;

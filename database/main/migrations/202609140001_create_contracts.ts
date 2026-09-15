import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Contract ledger: one row per contract, owned by a single user.
 *
 * Dates are stored as `YYYY-MM-DD` strings so list filters and "expiring within N days" comparisons stay portable
 * across dialects without timezone drift.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609140001_create_contracts',

  async up({ builder }) {
    await builder.createCollection('contracts', (collection) => {
      collection.uuid('id').notNull();
      collection.string('contractNo', { length: 64, nullable: false });
      collection.string('name', { length: 255, nullable: false });
      collection.string('counterparty', { length: 255, nullable: false });
      collection.string('type', { length: 32, nullable: false });
      collection.string('signedDate', { length: 10, nullable: true });
      collection.string('effectiveDate', { length: 10, nullable: true });
      collection.string('expiryDate', { length: 10, nullable: true });
      collection.decimal('amount', {
        precision: 18,
        scale: 2,
        nullable: false,
        defaultValue: 0,
      });
      collection.string('ownerId', { length: 64, nullable: false });
      collection.string('ownerName', { length: 255, nullable: true });
      collection.string('createdById', { length: 64, nullable: false });
      collection.string('status', { length: 32, nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.primary('id', { name: 'pk_contracts' });
      collection.unique('contractNo', { name: 'uq_contracts_contract_no' });
      collection.index('type', { name: 'idx_contracts_type' });
      collection.index('status', { name: 'idx_contracts_status' });
      collection.index('ownerId', { name: 'idx_contracts_owner' });
      collection.index('expiryDate', { name: 'idx_contracts_expiry' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('contracts');
  },
});

export default migration;

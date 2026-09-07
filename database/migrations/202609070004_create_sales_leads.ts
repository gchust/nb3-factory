import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Sales leads. A lead is unassigned (`ownerId` null) until a sales person
 * claims it; assigning an owner fires the lead-assignment notification
 * workflow. Converting a lead creates one customer, one contact and one
 * opportunity and records `convertedAt` / `convertedCustomerId` so a repeated
 * conversion is a no-op.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609070004_create_sales_leads',
  async up({ builder }) {
    await builder.createCollection('leads', (collection) => {
      collection.increments('id');
      collection.string('leadNo', { length: 64 }).notNull();
      collection.string('companyName', { length: 255 }).nullable();
      collection.string('contactName', { length: 255 }).nullable();
      collection.string('phone', { length: 64 }).nullable();
      collection.string('email', { length: 255 }).nullable();
      collection.string('source', { length: 64 }).nullable();
      collection.string('ownerId', { length: 64 }).nullable();
      collection.string('status', { length: 32 }).notNull().defaultTo('new');
      collection.text('notes').nullable();
      collection.datetime('convertedAt').nullable();
      collection.integer('convertedCustomerId').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('leadNo', { name: 'uq_leads_lead_no' });
      collection.index('ownerId', { name: 'idx_leads_owner' });
      collection.index('status', { name: 'idx_leads_status' });
      collection.foreignKey('ownerId', {
        name: 'fk_leads_owner',
        references: { collection: 'user', fields: ['id'] },
        onDelete: 'set null',
      });
      collection.foreignKey('convertedCustomerId', {
        name: 'fk_leads_converted_customer',
        references: { collection: 'customers', fields: ['id'] },
        onDelete: 'set null',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('leads');
  },
} satisfies MigrationDefinition);

export default migration;

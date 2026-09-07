import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * File table for customer business-license attachments, following the file
 * plugin's standard file-table shape. The owner foreign key lives on the file
 * table (`customerProfileId`, unique) so the one-to-one guarantee is a
 * database constraint; the business table owns the inverse logical relation.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609070007_create_sales_files',
  async up({ builder }) {
    await builder.createCollection('businessLicenseFiles', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('disk', { length: 64 }).notNull();
      collection.string('key', { length: 512 }).notNull();
      collection.string('filename', { length: 255 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.boolean('public').notNull().defaultTo(false);
      collection.integer('customerProfileId').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_business_license_files' });
      collection.unique(['disk', 'key'], {
        name: 'uq_business_license_files_disk_key',
      });
      collection.unique('customerProfileId', {
        name: 'uq_business_license_files_profile',
      });
      collection.foreignKey('customerProfileId', {
        name: 'fk_business_license_files_profile',
        references: { collection: 'customerProfiles', fields: ['id'] },
        onDelete: 'cascade',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('businessLicenseFiles');
  },
} satisfies MigrationDefinition);

export default migration;

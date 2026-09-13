import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Employee records: an employee owns many certificate records, and each certificate owns zero or more uploaded files.
 *
 * `employee_certificate_files` uses the collection shape the File plugin requires (id/disk/key/filename/ext/mimeType/
 * size/createdAt/updatedAt). The extra nullable `certificateId` links an uploaded file to the certificate it belongs
 * to; it is nullable because the generic upload action creates the file row before any business association exists.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609130001_create_employee_records',

  async up({ builder }) {
    await builder.createCollection('employees', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 255 }).notNull();
      collection.string('employeeNo', { length: 64 }).notNull();
      collection.string('department', { length: 255 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('employeeNo');
    });

    await builder.createCollection('employee_certificates', (collection) => {
      collection.increments('id');
      collection.integer('employeeId').notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.datetime('expiresAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('employeeId');
    });

    await builder.createCollection(
      'employee_certificate_files',
      (collection) => {
        collection.uuid('id').primary().notNull();
        collection.string('disk', { length: 255 }).notNull();
        collection.text('key').notNull();
        collection.text('filename').notNull();
        collection.string('ext', { length: 32 }).notNull();
        collection.string('mimeType', { length: 255 }).notNull();
        collection.bigInt('size').notNull();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.integer('certificateId').nullable();
        collection.index('certificateId');
      },
    );
  },

  async down({ builder }) {
    await builder.dropCollection('employee_certificate_files');
    await builder.dropCollection('employee_certificates');
    await builder.dropCollection('employees');
  },
});

export default migration;

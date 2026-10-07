import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Employee records.
 *
 * `userId` links the row to the application account it belongs to; it stays
 * null while the person is still onboarding. `status` drives the lifecycle:
 * `onboarding` (record created, no account yet), `active` (account exists and
 * can sign in) and `offboarded` (account disabled, record retained).
 *
 * The trailing block of fields is confidential: an identity document number
 * and its file link, the labour contract, and free-form attachments and notes.
 * The authorization model exposes them through a separate `viewConfidential`
 * action, so the person themselves and HR can read them while a supervisor
 * reading the same record through `view` never receives those columns.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611010002_create_hr_employees',
  async up({ builder }) {
    await builder.createCollection('hrEmployees', (collection) => {
      collection.increments('id');
      collection.string('employeeNo', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('userId', { length: 64 }).nullable();
      collection.integer('departmentId').nullable();
      collection.string('position', { length: 255 }).nullable();
      collection
        .string('status', { length: 32 })
        .notNull()
        .defaultTo('onboarding');
      collection.date('hireDate').nullable();
      collection.datetime('offboardedAt').nullable();
      collection.string('email', { length: 320 }).nullable();
      collection.string('phone', { length: 64 }).nullable();
      collection.string('idNumber', { length: 64 }).nullable();
      collection.string('idDocumentUrl', { length: 1024 }).nullable();
      collection.string('contractNo', { length: 128 }).nullable();
      collection.date('contractStartDate').nullable();
      collection.date('contractEndDate').nullable();
      collection.string('contractUrl', { length: 1024 }).nullable();
      collection.json('attachments').nullable();
      collection.text('notes').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.unique('employeeNo', { name: 'uq_hr_employees_no' });
      collection.index('userId', { name: 'idx_hr_employees_user' });
      collection.index('departmentId', { name: 'idx_hr_employees_department' });
      collection.index('status', { name: 'idx_hr_employees_status' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('hrEmployees');
  },
});

export default migration;

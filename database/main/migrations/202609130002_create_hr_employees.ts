import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609130002_create_hr_employees',

  async up({ builder }) {
    await builder.createCollection('hrEmployees', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 100, nullable: false });
      collection.string('employeeNo', { length: 64, nullable: false });
      collection.integer('departmentId', { nullable: true });
      collection.string('position', { length: 100, nullable: true });
      // ISO calendar date, e.g. 2024-03-01.
      collection.string('hireDate', { length: 10, nullable: true });
      collection
        .string('status', { length: 32, nullable: false })
        .defaultTo('active');
      collection.integer('annualLeaveDays', { nullable: false }).defaultTo(0);
      // Links a self-service account to this employee profile. Unique so one
      // login maps to at most one employee.
      collection.string('userId', { length: 255, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('employeeNo');
      collection.unique('userId');
      collection.index('departmentId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('hrEmployees');
  },
});

export default migration;

import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609130001_create_hr_departments',

  async up({ builder }) {
    await builder.createCollection('hrDepartments', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 100, nullable: false });
      // Employee id of the department person in charge. Kept as a plain
      // integer (no foreign key) because employees reference departments and
      // a cyclic constraint would block creating either first.
      collection.integer('managerId', { nullable: true });
      collection.string('managerName', { length: 100, nullable: true });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.unique('name');
      collection.index('managerId');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('hrDepartments');
  },
});

export default migration;

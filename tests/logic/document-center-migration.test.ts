// @vitest-environment node

import { fileURLToPath } from 'node:url';

import { describeMigration } from '@nocobase/app-testing/server';

/**
 * The Document Center migration is immutable history, so this proves the schema
 * it produces against a real database: the fields, the unique constraints that
 * make the seed idempotent, and the cascading foreign keys that keep the
 * version and visibility rows from outliving their document.
 */
const migrationsDirectory = fileURLToPath(
  new URL('../../database/main/migrations', import.meta.url),
);

const databasePackageName = '@nocobase/nb3-factory';

describeMigration('20260101000001-create-document-center', {
  sources: [
    {
      packageName: databasePackageName,
      directory: migrationsDirectory,
      extensions: ['.ts'],
    },
  ],
  async up({ expectCollection }) {
    await expectCollection('departments').toExist();
    await expectCollection('departments').toHaveField('code', {
      nullable: false,
    });
    await expectCollection('departments').toHaveIndex(['code'], {
      unique: true,
    });

    await expectCollection('departmentMembers').toHaveIndex(
      ['departmentId', 'userId'],
      { unique: true },
    );
    await expectCollection('departmentMembers').toHaveForeignKey(
      ['departmentId'],
      'departments',
      { referencedFields: ['id'], onDelete: 'cascade' },
    );

    await expectCollection('documents').toHaveIndex(['code'], {
      unique: true,
    });
    await expectCollection('documents').toHaveField('deletedAt', {
      nullable: true,
    });

    await expectCollection('documentDepartments').toHaveForeignKey(
      ['documentId'],
      'documents',
      { referencedFields: ['id'], onDelete: 'cascade' },
    );
    await expectCollection('documentDepartments').toHaveForeignKey(
      ['departmentId'],
      'departments',
      { referencedFields: ['id'], onDelete: 'cascade' },
    );
    await expectCollection('documentDepartments').toHaveIndex(
      ['documentId', 'departmentId'],
      { unique: true },
    );

    await expectCollection('documentVersions').toHaveForeignKey(
      ['documentId'],
      'documents',
      { referencedFields: ['id'], onDelete: 'cascade' },
    );
    await expectCollection('documentVersions').toHaveIndex(
      ['documentId', 'version'],
      { unique: true },
    );

    await expectCollection('documentBackups').toHaveField('snapshot');
    await expectCollection('documentQuestions').toHaveField('citations');
  },
  async down({ expectCollection }) {
    await expectCollection('documents').not.toExist();
    await expectCollection('documentVersions').not.toExist();
    await expectCollection('documentDepartments').not.toExist();
    await expectCollection('documentBackups').not.toExist();
    await expectCollection('documentQuestions').not.toExist();
    await expectCollection('departmentMembers').not.toExist();
    await expectCollection('departments').not.toExist();
  },
});

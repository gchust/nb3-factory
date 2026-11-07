// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'library-documents-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611010001_create_library_documents', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const documents = await expectCollection('libraryDocuments').toExist();
    expect(Object.keys(documents.fields)).toEqual([
      'id',
      'title',
      'body',
      'ownerId',
      'published',
      'confidential',
      'createdAt',
      'updatedAt',
    ]);
    expect(documents.primaryKey).toEqual(['id']);
    expect(documents.foreignKeys).toEqual([]);
    await expectCollection('libraryDocuments').toHaveField('title', {
      nullable: false,
      length: 200,
    });
    await expectCollection('libraryDocuments').toHaveField('ownerId', {
      nullable: false,
      length: 64,
    });
    await expectCollection('libraryDocuments').toHaveField('published', {
      nullable: false,
    });
    await expectCollection('libraryDocuments').toHaveIndex(['ownerId']);
    await expectCollection('libraryDocuments').toHaveIndex([
      'published',
      'confidential',
    ]);

    const row = {
      id: 'document-1',
      title: '馆藏说明',
      body: '正文',
      ownerId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await connection.query.insertInto('libraryDocuments').values(row).execute();
    const stored = await connection.query
      .selectFrom('libraryDocuments')
      .selectAll()
      .where('id', '=', 'document-1')
      .executeTakeFirstOrThrow();
    expect(stored.published).toBe(false);
    expect(stored.confidential).toBe(false);
    await expect(
      connection.query.insertInto('libraryDocuments').values(row).execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('libraryDocuments').not.toExist();
  },
});

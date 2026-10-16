// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'library-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The table every library route reads and writes, and the two flags the
// authorization model turns into a data scope and a restriction rule.
describeMigration('202610150001_create_documents', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const documents = await expectCollection('documents').toExist();
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
    // An empty body is allowed, a missing one is not.
    await expectCollection('documents').toHaveField('body', {
      nullable: false,
    });
    await expectCollection('documents').toHaveField('ownerId', {
      nullable: false,
    });
    await expectCollection('documents').toHaveIndex(['ownerId']);
    await expectCollection('documents').toHaveIndex([
      'published',
      'confidential',
    ]);

    const row = {
      title: '员工手册（公开）',
      body: '本手册面向全体员工。',
      ownerId: 'user-1',
      published: true,
      confidential: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await connection.query
      .insertInto('documents')
      .values({ ...row, id: 'a' })
      .execute();
    // The two flags default to false, so a document written without them is a
    // private draft: invisible to a reader and not confidential.
    await connection.query
      .insertInto('documents')
      .values({
        ...row,
        id: 'b',
        title: '草稿',
        published: undefined,
        confidential: undefined,
      })
      .execute();
    const stored = await connection.query
      .selectFrom('documents')
      .select(['published', 'confidential'])
      .where('id', '=', 'b')
      .executeTakeFirstOrThrow();
    expect(stored.published).toBe(false);
    expect(stored.confidential).toBe(false);
  },
  down: async ({ expectCollection }) => {
    await expectCollection('documents').not.toExist();
  },
});

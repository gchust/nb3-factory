// @vitest-environment node
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'documents-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202610270001_create_documents', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const documents = await expectCollection('documents').toExist();
    expect(Object.keys(documents.fields)).toEqual([
      'id',
      'title',
      'body',
      'ownerId',
      'ownerName',
      'published',
      'confidential',
      'createdAt',
      'updatedAt',
    ]);
    expect(documents.primaryKey).toEqual(['id']);
    await expectCollection('documents').toHaveField('id', {
      type: 'string',
      nullable: false,
    });
    await expectCollection('documents').toHaveField('body', {
      type: 'text',
      nullable: false,
    });
    await expectCollection('documents').toHaveField('published', {
      type: 'boolean',
      nullable: false,
    });
    await expectCollection('documents').toHaveField('confidential', {
      type: 'boolean',
      nullable: false,
    });
    await expectCollection('documents').toHaveField('ownerId', {
      type: 'string',
      nullable: false,
    });

    const shares = await expectCollection('documentShares').toExist();
    expect(Object.keys(shares.fields)).toEqual([
      'id',
      'documentId',
      'userId',
      'userName',
      'sharedById',
      'sharedByName',
      'expiresAt',
      'revokedAt',
      'createdAt',
      'updatedAt',
    ]);
    expect(shares.primaryKey).toEqual(['id']);
    await expectCollection('documentShares').toHaveField('expiresAt', {
      nullable: true,
    });
    await expectCollection('documentShares').toHaveField('revokedAt', {
      nullable: true,
    });

    const now = new Date();
    await connection.query
      .insertInto('documents')
      .values({
        id: 'document-a',
        title: 'Public document',
        body: 'Body',
        ownerId: 'user-a',
        ownerName: 'Ada',
        published: true,
        confidential: false,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await connection.query
      .insertInto('documentShares')
      .values({
        id: 'share-a',
        documentId: 'document-a',
        userId: 'user-b',
        userName: 'Grace',
        sharedById: 'user-a',
        sharedByName: 'Ada',
        expiresAt: null,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    // One share row per document and person is the table's idempotency boundary.
    await expect(
      connection.query
        .insertInto('documentShares')
        .values({
          id: 'share-b',
          documentId: 'document-a',
          userId: 'user-b',
          userName: 'Grace',
          sharedById: 'user-a',
          sharedByName: 'Ada',
          expiresAt: null,
          revokedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('documentShares').not.toExist();
    await expectCollection('documents').not.toExist();
  },
});

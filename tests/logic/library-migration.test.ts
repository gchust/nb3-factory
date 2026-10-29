// @vitest-environment node
import path from 'node:path';

import { describeMigration } from '@nocobase/app-testing/server';
import type { MigrationSource } from '@nocobase/db';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'library-migration-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The document library's tables and the constraints that keep a share coherent.
describeMigration('202610200001_create_library_documents', {
  sources,
  up: async ({ expectCollection }) => {
    const documents = await expectCollection('documents').toExist();
    expect(documents.primaryKey).toEqual(['id']);
    await expectCollection('documents').toHaveField('title', {
      nullable: false,
    });
    await expectCollection('documents').toHaveField('ownerId', {
      nullable: false,
    });
    await expectCollection('documents').toHaveField('published', {
      nullable: false,
    });
    await expectCollection('documents').toHaveField('confidential', {
      nullable: false,
    });
    await expectCollection('documents').toHaveIndex(['ownerId']);
    await expectCollection('documents').toHaveIndex([
      'published',
      'confidential',
    ]);
    await expectCollection('documents').toHaveForeignKey(['ownerId'], 'user', {
      onDelete: 'cascade',
    });

    const shares = await expectCollection('documentShares').toExist();
    expect(shares.primaryKey).toEqual(['id']);
    await expectCollection('documentShares').toHaveIndex(
      ['documentId', 'userId'],
      { unique: true },
    );
    await expectCollection('documentShares').toHaveIndex(['documentId']);
    await expectCollection('documentShares').toHaveIndex(['userId']);
    await expectCollection('documentShares').toHaveForeignKey(
      ['documentId'],
      'documents',
      { onDelete: 'cascade' },
    );
    await expectCollection('documentShares').toHaveForeignKey(
      ['userId'],
      'user',
      { onDelete: 'cascade' },
    );
  },
  down: async ({ expectCollection }) => {
    await expectCollection('documentShares').not.toExist();
    await expectCollection('documents').not.toExist();
  },
});

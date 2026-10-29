import { defineRecordAccess } from '@nocobase/authorization/core';
import type { DatabaseManager } from '@nocobase/db';
import { buildFilter } from '@nocobase/repository-input';

import type { DocumentShareRecord } from './document-types.js';

const NAMESPACE = 'nb3-factory';

/** The portable reference a permission or seed can persist without a database. */
export const documentsReadable = {
  key: 'documents.readable',
  collections: ['documents'],
} as const;

/**
 * The reader's selection: a document is readable when it is the person's own,
 * published and not confidential, or opened to that person by an active,
 * unexpired share. Confidential documents are excluded from the public and
 * shared branches no matter how a share was granted; ownership remains an
 * independent path so a maintainer keeps access to their own material.
 */
export function createDocumentsReadable(database: DatabaseManager) {
  const shares = database.repository<DocumentShareRecord>('documentShares');
  return defineRecordAccess(documentsReadable.key, (access) =>
    access
      .title({
        key: 'documents.recordAccess.readable',
        ns: NAMESPACE,
      })
      .collections('documents')
      .resolver(async ({ principal }) => {
        if (principal.type !== 'user') return false;
        const now = new Date();
        const activeShares = await shares.findMany({
          filter: (filter) =>
            filter.and([
              filter.string('userId').eq(principal.id),
              filter.date('revokedAt').empty(),
              filter.or([
                filter.date('expiresAt').empty(),
                filter.date('expiresAt').after(now),
              ]),
            ]),
          limit: 500,
        });
        const sharedIds = [
          ...new Set(activeShares.map((share) => share.documentId)),
        ];

        return buildFilter((filter) => {
          const branches = [
            filter.string('ownerId').eq(principal.id),
            filter.and([
              filter.boolean('published').isTrue(),
              filter.boolean('confidential').isFalse(),
            ]),
          ];
          if (sharedIds.length > 0) {
            branches.push(
              filter.and([
                filter.boolean('confidential').isFalse(),
                filter.or(sharedIds.map((id) => filter.string('id').eq(id))),
              ]),
            );
          }
          return filter.or(branches);
        });
      }),
  );
}

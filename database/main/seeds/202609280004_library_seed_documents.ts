import { defineSeed } from '@nocobase/db';

import {
  MAINTAINER_USERNAME,
  READER_USERNAME,
} from '../../seed-data/accounts.ts';
import { LIBRARY_DOCUMENTS } from '../../seed-data/documents.ts';

/**
 * Creates the three fictional documents and the deliberate confidential share.
 *
 * The documents belong to the maintainer account; the confidential one is
 * shared with the reader even though the reader's record access can never
 * match it. Idempotent by document id and, for the share, by the document and
 * account pair.
 */
export default defineSeed({
  name: '202609280004_library_seed_documents',
  transaction: true,
  async run({ query }) {
    const owner = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', MAINTAINER_USERNAME)
      .executeTakeFirst();
    if (!owner) {
      return;
    }
    const reader = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', READER_USERNAME)
      .executeTakeFirst();
    const ownerId = String(owner.id);
    const now = new Date();

    for (const fixture of LIBRARY_DOCUMENTS) {
      const existing = await query
        .selectFrom('documents')
        .select('id')
        .where('id', '=', fixture.id)
        .executeTakeFirst();
      if (!existing) {
        await query
          .insertInto('documents')
          .values({
            id: fixture.id,
            title: fixture.title,
            body: fixture.body,
            ownerId,
            published: fixture.published,
            confidential: fixture.confidential,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }

      if (!fixture.shareWithReader || !reader) {
        continue;
      }
      const readerId = String(reader.id);
      const existingShare = await query
        .selectFrom('documentShares')
        .select('id')
        .where('documentId', '=', fixture.id)
        .where('userId', '=', readerId)
        .executeTakeFirst();
      if (!existingShare) {
        await query
          .insertInto('documentShares')
          .values({
            id: crypto.randomUUID(),
            documentId: fixture.id,
            userId: readerId,
            createdAt: now,
          })
          .execute();
      }
    }
  },
});

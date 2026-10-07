import { defineSeed } from '@nocobase/db';

import {
  LIBRARY_DOCUMENTS,
  MAINTAINER_ACCOUNT,
} from '../../../server/library/seed-data.ts';

/**
 * The three demonstration documents: P (published), D (a draft), C (published
 * but confidential).
 *
 * Idempotent by id, and the owner is looked up by username so the rows follow
 * the account the accounts seed actually created rather than a hard-coded id.
 */
export default defineSeed({
  name: '202610070003_library_documents',
  async run({ query }) {
    const owner = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', MAINTAINER_ACCOUNT.username)
      .executeTakeFirst();

    const ownerId = owner ? String(owner.id) : MAINTAINER_ACCOUNT.id;
    const now = new Date();

    for (const document of LIBRARY_DOCUMENTS) {
      const existing = await query
        .selectFrom('documents')
        .select('id')
        .where('id', '=', document.id)
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('documents')
        .values({
          id: document.id,
          title: document.title,
          body: document.body,
          ownerId,
          published: document.published,
          confidential: document.confidential,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

import { randomUUID } from 'node:crypto';

import { defineSeed } from '@nocobase/db';

import { DOCUMENT_FIXTURES, DEMO_USERS } from '../../seed-data/documents.ts';

/** Creates the three fictional documents, all owned by 资料员甲. */
export default defineSeed({
  name: '202612010002_documents_records',

  run: async (context) => {
    const { query } = context;
    const editor = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', DEMO_USERS.editor.username)
      .executeTakeFirst();
    if (!editor) {
      throw new Error('The documents seed requires the editor account.');
    }

    for (const fixture of DOCUMENT_FIXTURES) {
      const existing = await query
        .selectFrom('documents')
        .select('id')
        .where('ownerId', '=', String(editor.id))
        .where('title', '=', fixture.title)
        .executeTakeFirst();
      if (existing) {
        continue;
      }

      const now = new Date();
      await context.repository('documents').createOne({
        values: {
          id: randomUUID(),
          title: fixture.title,
          content: fixture.content,
          ownerId: String(editor.id),
          published: fixture.published,
          confidential: fixture.confidential,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  },
});

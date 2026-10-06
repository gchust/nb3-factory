import { defineTools } from '@nocobase/ai-employee';
import { z } from 'zod';

import { documentsServiceToken } from '../../documents-service.js';

/**
 * The assistant's only data access. It answers with the documents the asker's authorization already
 * selects, so the supervisor-only document cannot enter a colleague's tool result, citation or error:
 * the filtering happens in the query, not in the prompt.
 */
export default defineTools({
  scope: 'SPECIFIED',
  execution: 'backend',
  defaultPermission: 'ALLOW',
  i18n: { namespace: 'nb3-factory' },
  // Display keys, not prose: the catalog looks these up in the application namespace with
  // `keySeparator: false`, so the locale file keeps them as flat dotted keys.
  introduction: {
    title: 'tool.search-documents.title',
    about: 'tool.search-documents.about',
  },
  definition: {
    name: 'search-documents',
    description:
      'Read internal documents the current user is allowed to see. Call with no query to list every document available, then answer only from that content and cite the document titles.',
    schema: z.object({
      query: z
        .string()
        .optional()
        .describe(
          'Optional keyword. Omit it to list every document this user may read.',
        ),
    }),
  },
  dependencies: { documents: documentsServiceToken },
  async invoke(ctx, args: { query?: string } | undefined) {
    const documents = await ctx.deps.documents.search(ctx.actor, args?.query);
    return {
      status: 'success',
      content: {
        documents: documents.map((document) => ({
          id: document.id,
          title: document.title,
          body: document.body,
        })),
      },
    };
  },
});

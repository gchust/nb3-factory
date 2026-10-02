import { defineTools } from '@nocobase/ai-employee';
import { z } from 'zod';

import { documentsServiceToken } from '../../providers/documents.js';

/**
 * Read-only lookup over the knowledge documents the calling actor may view.
 *
 * The tool has no identity argument: the actor comes from the execution, and
 * the document range comes from that actor's authorization decision. A caller
 * restricted to two documents receives two; asking for a hidden one is not a
 * request the tool can express.
 *
 * It returns every readable document rather than a top-N search result. The
 * corpus is small and an answer must be grounded in a document that is
 * actually present, so withholding one could only produce a false "not found".
 */
const searchMaterialsSchema = z.object({
  query: z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe(
      'Optional short description of what the user is looking for, used only to note the intent. It does not filter the result.',
    ),
});

export default defineTools({
  scope: 'SPECIFIED',
  execution: 'backend',
  defaultPermission: 'ALLOW',
  i18n: { namespace: 'nb3-factory' },
  introduction: {
    title: 'Search documents / 搜索资料',
    about:
      'List the knowledge documents the current user is allowed to read, so an answer can be grounded in them and cite them.',
  },
  definition: {
    name: 'searchMaterials',
    description:
      'List the knowledge documents the current user is allowed to read. Call this before answering any question about internal facts, phone numbers, intervals, codenames or policies. The result is the only permitted source for such an answer; never answer from general knowledge. Each document has an id, a title and a content body.',
    schema: searchMaterialsSchema,
  },
  dependencies: { documents: documentsServiceToken },
  async invoke(ctx, args) {
    const parsed = searchMaterialsSchema.safeParse(args as unknown);
    const query = parsed.success ? (parsed.data.query ?? '') : '';
    const documents = await ctx.deps.documents.list({ id: ctx.actor.id });
    return {
      status: 'success',
      content: {
        query,
        count: documents.length,
        documents: documents.map(({ id, title, content }) => ({
          id,
          title,
          content,
        })),
      },
    };
  },
});

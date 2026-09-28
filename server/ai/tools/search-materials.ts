import { defineTools } from '@nocobase/ai-employee';
import { z } from 'zod';
import { materialsServiceToken } from '../../providers/materials.js';

/**
 * The assistant's only tool. It is the boundary between the model and the
 * materials: the model never reads the collection, and this tool returns only
 * what the asking user is allowed to see, so a material hidden from a colleague
 * on the materials page cannot be answered from here.
 */
export const SEARCH_MATERIALS_TOOL = 'search-materials';

export default defineTools({
  scope: 'SPECIFIED',
  execution: 'backend',
  // Read-only and side-effect free, so it never needs an approval prompt.
  defaultPermission: 'ALLOW',
  requiresContext: true,
  i18n: { namespace: 'nb3-factory' },
  introduction: {
    title: '搜索资料',
    about: '按提问者在公司资料中检索相关内容，只返回提问者有权查看的资料正文。',
  },
  definition: {
    name: SEARCH_MATERIALS_TOOL,
    description: [
      'Search the company materials the current user is allowed to read, and return the matching materials with their titles, identifiers and bodies.',
      'Call this before answering any question about company rules, contacts, processes, equipment or internal facts.',
      'The result contains only materials the user may view: if it returns no match, the user has no accessible material on the topic and the answer must say so instead of guessing.',
    ].join(' '),
    schema: z.object({
      query: z
        .string()
        .describe(
          'The user question, or the keywords worth searching for, in the language the user asked in.',
        ),
    }),
  },
  dependencies: { materials: materialsServiceToken },
  async invoke(ctx, args: unknown) {
    const query = readQuery(args);
    const materials = await ctx.deps.materials.search(
      { id: ctx.actor.id },
      query,
    );

    return {
      status: 'success',
      content: {
        query,
        total: materials.length,
        matches: materials.map((material) => ({
          id: material.id,
          slug: material.slug,
          title: material.title,
          body: material.body,
        })),
        note: materials.length
          ? undefined
          : 'No material the asker is allowed to view matches this question. Tell the user the available materials are insufficient and do not answer from general knowledge.',
      },
    };
  },
});

/**
 * The tool arguments are untyped at the boundary — the model produces them — so
 * the only thing read here is the one string the schema declares, and a missing
 * or non-string value becomes an empty search rather than a thrown error.
 */
function readQuery(args: unknown): string {
  if (args && typeof args === 'object' && 'query' in args) {
    const { query } = args as { readonly query?: unknown };
    if (typeof query === 'string') {
      return query;
    }
  }
  return '';
}

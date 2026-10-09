import { defineTools } from '@nocobase/ai-employee';
import { z } from 'zod';

import { materialSearchServiceToken } from '../../materials/tokens.js';

/**
 * Reads the materials the asker is allowed to see.
 *
 * Read-only, so it needs no approval: a call can neither change data nor reach
 * a row the asker's own authorization does not select. Authorization happens
 * inside the service, against `ctx.actor` — the argument object carries only
 * search terms and never decides what may be read.
 */
export default defineTools({
  scope: 'SPECIFIED',
  execution: 'backend',
  defaultPermission: 'ALLOW',
  i18n: { namespace: 'nb3-factory' },
  introduction: {
    title: 'Search materials',
    about: 'Find the materials the asker is allowed to read.',
  },
  definition: {
    name: 'search-materials',
    description:
      'Search the materials the asker is allowed to read. Call it before answering any question about equipment, procedures or internal projects. Returns each matching material with its id, title and body. When nothing matches, it returns every material the asker may read instead; if none of them contains the answer, say the materials do not provide it.',
    schema: z.object({
      query: z
        .string()
        .describe(
          'The keywords or question to look for in the materials, such as "报修电话" or "巡检间隔".',
        ),
      limit: z
        .number()
        .int()
        .positive()
        .max(50)
        .optional()
        .describe('Maximum number of materials to return. Defaults to 20.'),
    }),
  },
  dependencies: { materials: materialSearchServiceToken },
  invoke: async (ctx, args: { query: string; limit?: number }) => {
    const result = await ctx.deps.materials.search(
      ctx.actor,
      args.query,
      args.limit ?? 20,
    );
    return { status: 'success', content: result };
  },
});

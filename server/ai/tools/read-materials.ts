import { defineTools } from '@nocobase/ai-employee';
import { z } from 'zod';

import { materialsServiceToken } from '../../providers/materials-service.js';

const ReadMaterialsArgs = z.object({
  query: z
    .string()
    .optional()
    .describe(
      'Words to look for in the title or body. Omit it to list every readable material.',
    ),
});

/**
 * The assistant's only capability: read the materials the asker may open.
 *
 * It is deliberately read-only and narrow. The service authorizes `view`
 * against the asker's own actor before it queries, so a question can never be
 * answered from a material the reading page would hide. The tool returns the
 * exact title and body so the model can quote and cite rather than summarize
 * from memory.
 */
export default defineTools({
  scope: 'SPECIFIED',
  execution: 'backend',
  defaultPermission: 'ALLOW',
  i18n: { namespace: 'nb3-factory' },
  introduction: {
    title: 'Read internal materials',
    about:
      'Search the internal materials the asker is allowed to read and return their exact text.',
  },
  definition: {
    name: 'read-materials',
    description:
      'Search the internal materials this user is allowed to read. Returns every readable material with its id, title and body. Answer only from the returned text, cite the material title and id you used, and say the materials are insufficient when nothing relevant is returned. Never invent a material or a value.',
    schema: ReadMaterialsArgs,
  },
  dependencies: { materials: materialsServiceToken },
  invoke: async (ctx, args) => {
    const parsed = ReadMaterialsArgs.safeParse(args);
    const query = parsed.success ? parsed.data.query : undefined;
    const context = await ctx.deps.materials.contextForActor(ctx.actor);
    try {
      const result = await ctx.deps.materials.list(context, {
        q: query,
        pageSize: 100,
      });
      return {
        status: 'success',
        content: {
          total: result.meta.total,
          materials: result.data.map(({ id, title, body }) => ({
            id,
            title,
            body,
          })),
        },
      };
    } catch (error) {
      // A caller with no read permission gets the same honest answer as a
      // search that matched nothing: this assistant has no material to answer
      // from. It must never fall back to a pre-written reply.
      ctx.runtime.logger?.warn?.(
        `read-materials was denied for ${String(ctx.actor.id)}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { status: 'success', content: { total: 0, materials: [] } };
    }
  },
});

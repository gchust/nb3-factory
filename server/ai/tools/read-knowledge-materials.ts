import { defineTools } from '@nocobase/ai-employee';
import { z } from 'zod';

import { knowledgeServiceToken } from '../../knowledge/service.js';

/**
 * The assistant's only tool: read the materials the person asking may read.
 *
 * It is deliberately the only way an answer can reach material text. The tool asks the same service the materials
 * page reads through, and that service applies the stored permission-set grants with `withPolicy`, so a material the
 * asker may not open cannot be retrieved here either. The assistant therefore has no path to a supervisor-only
 * material that the page does not also have, and nothing in the tool needs to know which materials those are.
 *
 * The tool only reads. It is `SPECIFIED`, so it exists for the employee that names it, and `ALLOW`, so a read does
 * not raise an approval prompt on every question.
 */
export default defineTools({
  scope: 'SPECIFIED',
  execution: 'backend',
  defaultPermission: 'ALLOW',
  i18n: { namespace: 'nb3-factory' },
  introduction: {
    title: 'Read knowledge materials',
    about:
      'List the materials this person may read, or one of them by identifier.',
  },
  definition: {
    name: 'read-knowledge-materials',
    description:
      'Read the knowledge materials available to the current user. Call it before answering any question about the materials. Without an argument it returns every material the user may read; pass an identifier to read one.',
    schema: z.object({
      id: z
        .string()
        .optional()
        .describe('The identifier of a single material to read.'),
    }),
  },
  dependencies: { knowledge: knowledgeServiceToken },
  invoke: async (ctx, args) => {
    const { id } = (args ?? {}) as { id?: string };
    const actorId = String(ctx.actor.id);
    const materials = id
      ? [await ctx.deps.knowledge.visibleMaterial(actorId, id)].filter(
          (material) => material !== undefined,
        )
      : await ctx.deps.knowledge.visibleMaterials(actorId);
    return {
      status: 'success',
      content: {
        // Said explicitly so a model cannot read an empty list as a lookup failure and answer from memory instead.
        materials,
        total: materials.length,
      },
    };
  },
});

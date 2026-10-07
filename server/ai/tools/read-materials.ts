import { defineTools } from '@nocobase/ai-employee';
import { materialsServiceToken } from '../../services/materials.js';

/**
 * The assistant's only data source: the materials the person asking is allowed to read.
 *
 * It goes through the same service the materials page does, so the record access a permission set grants applies here
 * too — a colleague's call never returns the restricted material, and the model therefore has nothing to answer from.
 */
export const readMaterialsTool = defineTools({
  scope: 'SPECIFIED',
  execution: 'backend',
  defaultPermission: 'ALLOW',
  introduction: {
    title: '读取资料',
    about: '查证问题时读取当前用户有权查看的资料正文。',
  },
  definition: {
    name: 'read-materials',
    description:
      'Return every material the person asking is allowed to read, each with its id, title and body. Call this before answering any question about company rules, procedures, contacts or projects. The result is the only permitted source of such answers: if the needed fact is not in it, say the materials are insufficient instead of answering from general knowledge.',
    schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  dependencies: {
    materials: materialsServiceToken,
  },
  async invoke(ctx) {
    const authorization = await ctx.deps.materials.contextFor(ctx.actor);
    const result = await ctx.deps.materials.list(authorization, {
      limit: 200,
      offset: 0,
    });
    return {
      total: result.total,
      materials: result.data.map((material) => ({
        id: material.id,
        title: material.title,
        body: material.body,
      })),
    };
  },
});

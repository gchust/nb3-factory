import { defineTools } from '@nocobase/ai-employee';
import { z } from 'zod';

import { knowledgeServiceToken } from '../../knowledge-service.js';

/** The tool's arguments; parsed rather than trusted, because `invoke` receives `any`. */
const knowledgeSearchSchema = z.object({
  query: z.string().min(1).describe('要检索的问题或关键词，例如“设备报修电话”'),
});

/**
 * Deterministic, permission-aware retrieval over the internal document
 * library. The tool runs with the asker's own authorization context, so the
 * documents it returns are exactly the documents that person may open — a
 * restricted document is never scored, never quoted and never cited to
 * someone who cannot see it. It only reads: there is no parameter that writes.
 */
export default defineTools({
  scope: 'SPECIFIED',
  execution: 'backend',
  defaultPermission: 'ALLOW',
  requiresContext: false,
  i18n: { namespace: 'nb3-factory' },
  introduction: {
    title: '检索内部资料',
    about: '在提问者有权查看的内部资料中检索与问题相关的文档。',
  },
  definition: {
    name: 'knowledge-search',
    description:
      '在内部资料库中检索与问题相关的文档。回答资料相关的问题前必须先调用本工具。' +
      '它只返回提问者有权查看的文档；没有匹配时返回空列表，此时应告知资料不足，不要编造。',
    schema: knowledgeSearchSchema,
  },
  dependencies: { knowledge: knowledgeServiceToken },
  invoke: async (ctx, args) => {
    const parsed = knowledgeSearchSchema.safeParse(args);
    const query = parsed.success ? parsed.data.query.trim() : '';
    if (!query) {
      return {
        status: 'success',
        content: {
          query: '',
          matches: [],
          note: '没有提供检索关键词，请重新提问。',
        },
      };
    }

    try {
      const context = await ctx.deps.knowledge.contextForActor({
        id: ctx.actor.id,
        roles: ctx.actor.roles,
        isRoot: ctx.actor.isRoot,
      });
      const matches = await ctx.deps.knowledge.searchDocuments(
        context,
        query,
        5,
      );
      return {
        status: 'success',
        content: {
          query,
          // Only title and body are exposed; the assistant is asked to cite the
          // title so the asker can open the same document and verify it.
          matches: matches.map((match) => ({
            id: match.id,
            title: match.title,
            body: match.body,
            score: Number(match.score.toFixed(4)),
          })),
          note:
            matches.length === 0
              ? '没有在提问者有权查看的资料中找到相关内容，请明确回答资料不足，不要编造。'
              : '只能依据这些资料回答，并说明使用了哪一篇。',
        },
      };
    } catch (error) {
      ctx.runtime.logger?.warn?.(
        { err: error, tool: 'knowledge-search' },
        'Knowledge search failed',
      );
      return {
        status: 'success',
        content: {
          query,
          matches: [],
          note: '检索内部资料失败，请告知用户当前无法从资料中回答，不要编造内容。',
        },
      };
    }
  },
});

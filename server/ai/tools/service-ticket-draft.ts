import { defineTools } from '@nocobase/ai-employee';
import { z } from 'zod';

import {
  serviceAccessToken,
  serviceAssistantToken,
} from '../../service/tokens.js';

/**
 * Turns a ticket or a free-text symptom into a handling draft by retrieving the
 * published equipment manuals the caller may read. Read-only and never writes a
 * business record: the draft reaches the user's screen, and saving it stays an
 * explicit action of the person who asked.
 *
 * The actor arrives from the agent context and is resolved through the same
 * `ServiceAccess` the HTTP routes use, so an employee with a tool cannot read a
 * ticket its caller could not open in the browser.
 */
export default defineTools({
  scope: 'SPECIFIED',
  execution: 'backend',
  requiresContext: true,
  defaultPermission: 'ALLOW',
  i18n: { namespace: 'nb3-factory' },
  introduction: {
    title: '生成处理草稿',
    about: '按工单现象检索设备手册，返回处理建议草稿与依据。',
  },
  definition: {
    name: 'service-ticket-draft',
    description:
      'Read one after-sales ticket and its device manuals, then return a handling draft with the references it used. Read-only; it does not save anything.',
    schema: z.object({
      ticketId: z.number().int().positive().optional(),
      question: z.string().optional(),
      language: z.enum(['zh-CN', 'en-US']).optional(),
    }),
  },
  dependencies: {
    access: serviceAccessToken,
    assistant: serviceAssistantToken,
  },
  invoke: async (ctx, args) => {
    const input = (args ?? {}) as {
      ticketId?: number;
      question?: string;
      language?: string;
    };
    if (input.ticketId == null && !input.question?.trim()) {
      return {
        status: 'error',
        content: 'Provide a ticketId or a question.',
      };
    }
    const actor = await ctx.deps.access.actor(String(ctx.actor.id));
    try {
      const answer = await ctx.deps.assistant.draft(
        {
          ticketId: input.ticketId ?? null,
          question: input.question ?? null,
          language: input.language ?? ctx.actor.locale ?? null,
        },
        actor,
      );
      return { status: 'success', content: answer };
    } catch (error) {
      // A refusal is a normal answer for the conversation, not a crash: return
      // the message so the model can tell the user it cannot read that ticket.
      return {
        status: 'error',
        content: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

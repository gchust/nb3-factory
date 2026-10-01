import { defineTools } from '@nocobase/ai-employee';
import { z } from 'zod';
import {
  accessServiceToken,
  knowledgeServiceToken,
  ticketServiceToken,
} from '../../services/contracts.js';

/**
 * Retrieval over the material the asking user may read: published knowledge
 * articles, the shipped device manuals and the tickets their role can open.
 *
 * It answers with citations and never writes — saving a draft into a process
 * note stays a user action in the ticket page.
 */
export default defineTools({
  scope: 'SPECIFIED',
  execution: 'backend',
  defaultPermission: 'ALLOW',
  i18n: { namespace: 'nb3-factory' },
  introduction: {
    title: 'Service knowledge lookup',
    about:
      'Look up published knowledge articles, device manuals and the tickets the user may read, with cited sources.',
  },
  definition: {
    name: 'service-knowledge-lookup',
    description:
      'Answer a service question from published knowledge articles, internal device manuals and the tickets the asking user is allowed to read. Always returns the sources it used.',
    schema: z.object({
      question: z.string().describe('The service question to answer.'),
    }),
  },
  dependencies: {
    knowledge: knowledgeServiceToken,
    tickets: ticketServiceToken,
    access: accessServiceToken,
  },
  invoke: async (ctx, args) => {
    const actor = await ctx.deps.access.resolveActor(String(ctx.actor.id));
    const parsedArgs = args as { question?: unknown } | null;
    const question =
      typeof parsedArgs?.question === 'string' ? parsedArgs.question : '';
    const ticketSources = await ctx.deps.tickets
      .listTickets(actor, { pageSize: 20 })
      .then((result) =>
        result.items.map((ticket) => ({
          id: ticket.id,
          code: ticket.code,
          title: ticket.title,
          detail: [ticket.description, ticket.processNote, ticket.resultNote]
            .filter((value): value is string => Boolean(value))
            .join(' '),
        })),
      )
      .catch(() => []);
    const answer = await ctx.deps.knowledge.askAssistant(actor, question, {
      tickets: ticketSources,
    });
    return { status: 'success', content: answer };
  },
});

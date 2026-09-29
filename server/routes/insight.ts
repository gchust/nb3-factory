import { Hono } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import {
  accessServiceToken,
  dashboardServiceToken,
  knowledgeServiceToken,
  ticketServiceToken,
  type ServiceActor,
} from '../services/contracts.js';
import {
  asText,
  readJsonBody,
  requireActor,
  route,
  toNumber,
} from './helpers.js';

/** Dashboard aggregates and the retrieval-backed service assistant. */
export function createInsightRouter(app: Application): Hono {
  const router = new Hono();
  const dashboard = () => app.container.resolve(dashboardServiceToken);
  const knowledge = () => app.container.resolve(knowledgeServiceToken);
  const tickets = () => app.container.resolve(ticketServiceToken);
  const access = () => app.container.resolve(accessServiceToken);

  router.get(
    '/dashboard',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const result = await dashboard().getDashboard(actor);
      return context.json({ data: result });
    }),
  );

  router.get(
    '/assistant/messages',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const messages = await knowledge().listAssistantHistory(actor, {
        ticketId: toNumber(context.req.query('ticketId')),
        limit: toNumber(context.req.query('limit')),
      });
      return context.json({ data: messages });
    }),
  );

  router.post(
    '/assistant/ask',
    route(async (context) => {
      const actor = await requireActor(context, access());
      const body = await readJsonBody(context);
      const question = asText(body.question);
      const ticketId = toNumber(asText(body.ticketId));
      const ticketSources = await collectTicketSources(actor);
      const answer = await knowledge().askAssistant(actor, question, {
        tickets: ticketSources,
      });
      const message = await knowledge().recordAssistantExchange(
        actor,
        answer,
        ticketId === undefined ? {} : { ticketId },
      );
      return context.json({ data: answer, message });
    }),
  );

  async function collectTicketSources(
    actor: ServiceActor,
  ): Promise<{ id: number; code: string; title: string; detail: string }[]> {
    try {
      const result = await tickets().listTickets(actor, { pageSize: 20 });
      return result.items.map((ticket) => ({
        id: ticket.id,
        code: ticket.code,
        title: ticket.title,
        detail: [ticket.description, ticket.processNote, ticket.resultNote]
          .filter(Boolean)
          .join(' '),
      }));
    } catch {
      return [];
    }
  }

  return router;
}

import { Hono } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import {
  accessServiceToken,
  forbidden,
  ticketServiceToken,
} from '../services/contracts.js';
import {
  asString,
  asText,
  readJsonBody,
  requireActor,
  route,
} from './helpers.js';

/**
 * The device platform's interface, authenticated with an API Key.
 *
 * The key resolves to the integration user's session, so `auth.required()`
 * rejects a revoked key, and Authentication rejects a disabled owner before
 * this router runs. Business-level deduplication is on the external event
 * number.
 */
export function createExternalRouter(app: Application): Hono {
  const router = new Hono();
  const tickets = () => app.container.resolve(ticketServiceToken);
  const access = () => app.container.resolve(accessServiceToken);

  router.post(
    '/external/repair-requests',
    route(async (context) => {
      const actor = await requireActor(context, access());
      if (!(actor.isRoot || actor.isIntegration)) {
        throw forbidden(
          'This interface is reserved for the device-platform integration account.',
        );
      }
      const body = await readJsonBody(context);
      const result = await tickets().createExternalTicket(actor, {
        externalEventNo: asText(body.externalEventNo),
        deviceCode: asText(body.deviceCode),
        title: asText(body.title),
        description: asString(body.description),
        priority: asString(body.priority),
        contactName: asString(body.contactName),
        contactPhone: asString(body.contactPhone),
      });
      return context.json(
        { data: result.ticket, deduplicated: result.deduplicated },
        result.deduplicated ? 200 : 201,
      );
    }),
  );

  router.get(
    '/external/tickets/:id',
    route(async (context) => {
      const actor = await requireActor(context, access());
      if (!(actor.isRoot || actor.isIntegration)) {
        throw forbidden(
          'This interface is reserved for the device-platform integration account.',
        );
      }
      const ticket = await tickets().getTicket(
        actor,
        Number(context.req.param('id')),
      );
      return context.json({ data: ticket });
    }),
  );

  router.get(
    '/external/repair-requests/:externalEventNo',
    route(async (context) => {
      const actor = await requireActor(context, access());
      if (!(actor.isRoot || actor.isIntegration)) {
        throw forbidden(
          'This interface is reserved for the device-platform integration account.',
        );
      }
      const ticket = await tickets().getTicketByExternalEvent(
        actor.id,
        context.req.param('externalEventNo') ?? '',
      );
      if (!ticket) {
        return context.json(
          {
            code: 'NOT_FOUND',
            message: 'No ticket exists for that event number.',
          },
          404,
        );
      }
      return context.json({ data: ticket });
    }),
  );

  return router;
}

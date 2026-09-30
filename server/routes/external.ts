import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { serviceTicketServiceToken } from '../providers/tokens.js';
import type {
  ExternalTicketInput,
  ServiceTicketService,
} from '../providers/ticket-service.js';
import {
  actorOf,
  authorizeAction,
  errorCode,
  jsonBody,
  numericParam,
  queryInteger,
  requirePolicy,
  type ServiceEnv,
} from './service-shared.js';

/**
 * The external device-platform API. A machine client signs in with an API key
 * and may submit a repair event and read back only the tickets it created. The
 * external event number is unique, so a repeated delivery returns the existing
 * ticket instead of creating a second one.
 */
export function createExternalRoutes(
  app: AppPluginApplication,
): Hono<ServiceEnv> {
  const auth = app.container.resolve(authenticationToken);
  const authz = app.container.resolve(authorizationToken);
  const tickets: ServiceTicketService = app.container.resolve(
    serviceTicketServiceToken,
  );
  const routes = new Hono<ServiceEnv>();

  routes.use('*', auth.required(), authz.middleware());

  routes.post('/repair-events', async (context) => {
    await authorizeAction(context, 'service.tickets', 'create');
    const body = await jsonBody(context);
    const externalEventId = body.externalEventId;
    const deviceSerialNumber = body.deviceSerialNumber;
    const title = body.title;
    if (
      typeof externalEventId !== 'string' ||
      externalEventId.trim().length === 0
    ) {
      throw new HTTPException(400, { message: 'externalEventId is required' });
    }
    if (
      typeof deviceSerialNumber !== 'string' ||
      deviceSerialNumber.trim().length === 0
    ) {
      throw new HTTPException(400, {
        message: 'deviceSerialNumber is required',
      });
    }
    if (typeof title !== 'string' || title.trim().length === 0) {
      throw new HTTPException(400, { message: 'title is required' });
    }
    const input: ExternalTicketInput = {
      externalEventId,
      deviceSerialNumber,
      title,
    };
    if (typeof body.description === 'string')
      input.description = body.description;
    if (typeof body.priority === 'string') input.priority = body.priority;
    if (typeof body.reporterName === 'string')
      input.reporterName = body.reporterName;
    if (typeof body.occurredAt === 'string') input.occurredAt = body.occurredAt;
    if (typeof body.externalPlatform === 'string') {
      input.externalPlatform = body.externalPlatform;
    }
    try {
      const outcome = await tickets.submitExternal(input, actorOf(context));
      return context.json(
        {
          data: outcome.ticket,
          created: outcome.created,
          duplicate: outcome.duplicate,
        },
        outcome.created ? 201 : 200,
      );
    } catch (error) {
      if (errorCode(error) === 'device_not_found') {
        throw new HTTPException(404, {
          message: 'The device serial number is not registered',
        });
      }
      throw error;
    }
  });

  routes.get('/tickets', async (context) => {
    await authorizeAction(context, 'service.tickets', 'view');
    const data = await tickets.listForIntegration(actorOf(context).id, {
      limit: queryInteger(context, 'limit'),
      offset: queryInteger(context, 'offset'),
    });
    return context.json({ data });
  });

  routes.get('/tickets/:id', async (context) => {
    const policies = await authorizeAction(context, 'service.tickets', 'view');
    const ticket = await tickets.get(
      {
        tickets: requirePolicy(policies, 'serviceTickets'),
        events: policies.serviceTicketEvents,
      },
      numericParam(context),
    );
    if (!ticket) throw new HTTPException(404, { message: 'Not found' });
    return context.json({ data: ticket });
  });

  return routes;
}

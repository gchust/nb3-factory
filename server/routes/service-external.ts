import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  describeRoute,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import type { FilterBuilder, FilterNode, RepositoryRecord } from '@nocobase/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { ticketServiceToken } from '../service/ticket-service.js';
import {
  authorizationFor,
  policyFor,
  requireActor,
  serviceError,
} from './helpers.js';

const tags = ['Service external integration'];

const submitBody = z.object({
  eventNo: z.string().min(1),
  deviceSerial: z.string().min(1),
  title: z.string().optional(),
  problem: z.string().optional(),
  priority: z.enum(['normal', 'urgent']).default('normal'),
  customerName: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  deviceName: z.string().optional(),
});

const lookupQuery = z.object({
  eventNo: z.string().min(1).optional(),
  ticketNo: z.string().min(1).optional(),
});

const ticketNoParam = z.object({ ticketNo: z.string().min(1) });

const recordShape = z.record(z.string(), z.unknown());

/**
 * The device-platform interface. Callers authenticate with an API key created
 * in the application; the key resolves to its owner, whose job permission set
 * decides what may be read or written. Submitting is idempotent on the
 * platform event number, so a retried delivery never creates a second ticket.
 */
export function registerExternalRoutes(app: Application, router: Hono): void {
  const database = app.container.resolve(databaseManagerToken);
  const tickets = app.container.resolve(ticketServiceToken);

  const requireIntegration = async (userId: string): Promise<void> => {
    const allowed =
      (await tickets.holdsPermissionSet(userId, 'service-integration')) ||
      (await tickets.holdsPermissionSet(userId, 'service-supervisor')) ||
      (await tickets.holdsPermissionSet(userId, 'root'));
    if (!allowed) {
      throw new ApiError({
        status: 'PERMISSION_DENIED',
        reason: 'INTEGRATION_ACCOUNT_REQUIRED',
        domain: 'service',
        message:
          'This endpoint is limited to the device-platform integration account.',
      });
    }
  };

  const scopedTickets = async (context: Parameters<typeof requireActor>[1]) => {
    const actor = await requireActor(app, context);
    await requireIntegration(actor.id);
    const authorization = authorizationFor(app, actor.id);
    const policy = await policyFor(app, 'tickets', authorization);
    return {
      actor,
      repository: database.repository('tickets').withPolicy(policy),
    };
  };

  router.post(
    '/service/external/tickets',
    describeRoute({
      tags,
      summary: 'Submit a device repair request from the device platform',
      operationId: 'serviceExternalTicketSubmit',
      description:
        'Idempotent on eventNo: a repeated submission returns the ticket created by the first one with duplicate=true.',
      responses: {
        201: dataResponse(
          z.object({ ticket: recordShape, duplicate: z.boolean() }),
        ),
        200: dataResponse(
          z.object({ ticket: recordShape, duplicate: z.boolean() }),
        ),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('json', submitBody),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireIntegration(actor.id);
      try {
        const result = await tickets.submitExternalTicket(
          context.req.valid('json'),
          { id: actor.id, name: actor.name },
        );
        return context.json({ data: result }, result.duplicate ? 200 : 201);
      } catch (error) {
        serviceError(error);
      }
    },
  );

  router.get(
    '/service/external/tickets',
    describeRoute({
      tags,
      summary: 'Look up a ticket this integration account submitted',
      operationId: 'serviceExternalTicketLookup',
      responses: {
        200: dataResponse(ticketListShape()),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('query', lookupQuery),
    async (context) => {
      const query = context.req.valid('query');
      const { repository } = await scopedTickets(context);
      const eventNo = query.eventNo;
      const ticketNo = query.ticketNo;
      const hasLookup = Boolean(eventNo || ticketNo);
      const items = await repository.findMany({
        ...(hasLookup
          ? {
              filter: (builder: FilterBuilder<Partial<RepositoryRecord>>) => {
                const nodes: FilterNode[] = [];
                if (eventNo) {
                  nodes.push(builder.string('externalEventNo').eq(eventNo));
                }
                if (ticketNo) {
                  nodes.push(builder.string('ticketNo').eq(ticketNo));
                }
                return nodes.length === 1 ? nodes[0] : builder.and(nodes);
              },
            }
          : {}),
        sort: (sort) => [sort.field('createdAt').desc()],
        limit: 50,
      });
      return context.json({ data: items });
    },
  );

  router.get(
    '/service/external/tickets/:ticketNo',
    describeRoute({
      tags,
      summary: 'Read one submitted ticket by its service number',
      operationId: 'serviceExternalTicketFindOne',
      responses: {
        200: dataResponse(recordShape),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        404: apiErrorResponse(404),
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', ticketNoParam),
    async (context) => {
      const { repository } = await scopedTickets(context);
      const ticket = await repository.findOne({
        filter: { ticketNo: context.req.valid('param').ticketNo },
      });
      if (!ticket) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'SERVICE_TICKET_NOT_FOUND',
          domain: 'service',
          message: 'No submitted ticket has that number.',
        });
      }
      return context.json({ data: ticket });
    },
  );
}

function ticketListShape() {
  return z.array(z.record(z.string(), z.unknown()));
}

import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  describeRoute,
  emptyResponse,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import type { FilterBuilder, FilterNode } from '@nocobase/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { coerceText } from '../service/scalars.js';
import { ticketServiceToken } from '../service/ticket-service.js';
import { touched } from '../service/timestamps.js';
import {
  authorizationFor,
  isSupervisor,
  policyFor,
  requireActor,
  requireCollectionAction,
  requireSupervisor,
  serviceError,
} from './helpers.js';

const tags = ['Service tickets'];

const idParam = z.object({ id: z.coerce.number().int().positive() });

const listQuery = z.object({
  status: z.string().optional(),
  mine: z.coerce.boolean().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const createBody = z.object({
  title: z.string().min(1),
  deviceId: z.coerce.number().int().positive().optional(),
  deviceSerial: z.string().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  problem: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  dueAt: z.string().optional(),
  ownerId: z.string().optional(),
  confidential: z.boolean().default(false),
});

const acceptBody = z.object({
  accept: z.boolean(),
  ownerId: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  reason: z.string().optional(),
});

const resultBody = z.object({
  result: z.string().min(1),
  resolutionNote: z.string().optional(),
});

const assistantDraftBody = z.object({ draft: z.string().min(1) });

const reasonBody = z.object({ reason: z.string().min(1) });
const visibilityBody = z.object({ observerVisible: z.boolean() });
const shareBody = z.object({ engineerId: z.string().min(1) });
const engineerParam = z.object({
  id: z.coerce.number().int().positive(),
  engineerId: z.string().min(1),
});
const attachBody = z.object({
  fileId: z.string().uuid(),
  category: z.enum(['photo', 'report', 'other']).default('other'),
});
const attachParam = z.object({
  id: z.coerce.number().int().positive(),
  fileId: z.string().uuid(),
});

const ticketShape = z.record(z.string(), z.unknown());
const listShape = z.object({
  items: z.array(ticketShape),
  total: z.number(),
});

/**
 * Ticket endpoints. Read paths run under the record-scoped Repository Policy
 * built for the signed-in user; state changes go through the domain service,
 * which enforces ownership and legal transitions on top of the collection
 * check.
 */
export function registerTicketRoutes(app: Application, router: Hono): void {
  const database = app.container.resolve(databaseManagerToken);
  const tickets = app.container.resolve(ticketServiceToken);

  const scopedTickets = async (context: Parameters<typeof requireActor>[1]) => {
    const actor = await requireActor(app, context);
    const authorization = authorizationFor(app, actor.id);
    const policy = await policyFor(app, 'tickets', authorization);
    return {
      actor,
      repository: database.repository('tickets').withPolicy(policy),
    };
  };

  router.get(
    '/service/dashboard',
    describeRoute({
      tags,
      summary: 'Service dashboard counters',
      operationId: 'serviceDashboardSummary',
      responses: {
        200: dataResponse(z.record(z.string(), z.unknown())),
        401: apiErrorResponses['401'],
        500: apiErrorResponses['500'],
      },
    }),
    async (context) => {
      // Counters follow the same record scope as the list, so an engineer sees
      // their own workload and a supervisor sees the whole team's.
      const { actor, repository } = await scopedTickets(context);
      const supervisor = await isSupervisor(app, actor.id);
      const rows = await repository.findMany({ limit: 2000 });
      const now = Date.now();
      const byStatus: Record<string, number> = {};
      let overdue = 0;
      let urgentOpen = 0;
      let myOpen = 0;
      for (const ticket of rows) {
        const status = coerceText(ticket.status);
        byStatus[status] = (byStatus[status] ?? 0) + 1;
        if (status !== 'closed') {
          if (
            ticket.dueAt &&
            new Date(coerceText(ticket.dueAt)).getTime() < now
          ) {
            overdue += 1;
          }
          if (ticket.priority === 'urgent') {
            urgentOpen += 1;
          }
        }
        if (ticket.ownerId === actor.id && status !== 'closed') {
          myOpen += 1;
        }
      }
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
      }).format(new Date());
      const inspections = await database.repository('inspections').findMany({
        filter: (builder) =>
          builder.and([
            builder.string('ownerId').eq(actor.id),
            builder.date('plannedDate').on(today),
          ]),
      });
      const acceptanceFailures = supervisor
        ? (
            await database
              .query('main')
              .selectFrom('acceptance_logs')
              .select('id')
              .where('status', '=', 'failed')
              .execute<{ id: number }>()
          ).length
        : 0;
      // Per-engineer workload is derived from the same policy-scoped rows, so
      // an engineer only ever sees their own bucket and a supervisor sees the
      // whole team. The engineer list comes from the permission-set assignment,
      // so both engineers appear even before they own a ticket.
      const engineerRows = supervisor
        ? await database
            .query('main')
            .selectFrom(
              'authorization_permission_set_assignments as assignment',
            )
            .innerJoin('user', 'user.id', 'assignment.subject_id')
            .select(['user.id as id', 'user.name as name'])
            .where('assignment.subject_type', '=', 'user')
            .where('assignment.permission_set_key', '=', 'service-engineer')
            .execute<{ id: string; name: string | null }>()
        : [{ id: actor.id, name: actor.name ?? null }];
      const byEngineerMap = new Map<
        string,
        { engineerId: string; name: string; total: number; open: number }
      >();
      for (const row of engineerRows) {
        byEngineerMap.set(row.id, {
          engineerId: row.id,
          name: row.name ?? row.id,
          total: 0,
          open: 0,
        });
      }
      for (const ticket of rows) {
        const ownerId = coerceText(ticket.ownerId);
        if (!ownerId) {
          continue;
        }
        let entry = byEngineerMap.get(ownerId);
        if (!entry) {
          entry = { engineerId: ownerId, name: ownerId, total: 0, open: 0 };
          byEngineerMap.set(ownerId, entry);
        }
        entry.total += 1;
        if (coerceText(ticket.status) !== 'closed') {
          entry.open += 1;
        }
      }
      const byEngineer = [...byEngineerMap.values()].sort((a, b) =>
        b.open !== a.open ? b.open - a.open : b.total - a.total,
      );
      return context.json({
        data: {
          byStatus,
          overdue,
          urgentOpen,
          myOpen,
          pendingInspectionsToday: inspections.filter(
            (item) => item.status === 'pending',
          ).length,
          acceptanceFailures,
          unreadMessages: await tickets.unreadCount(actor.id),
          total: rows.length,
          byEngineer,
        },
      });
    },
  );

  router.get(
    '/service/tickets',
    describeRoute({
      tags,
      summary: 'List service tickets visible to the signed-in user',
      operationId: 'serviceTicketsFindMany',
      responses: {
        200: dataResponse(listShape),
        401: apiErrorResponses['401'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('query', listQuery),
    async (context) => {
      const query = context.req.valid('query');
      const { actor, repository } = await scopedTickets(context);
      const needsFilter = Boolean(query.status || query.mine || query.q);
      const filter = (builder: FilterBuilder): FilterNode => {
        const parts: FilterNode[] = [];
        if (query.status) {
          parts.push(builder.string('status').eq(query.status));
        }
        if (query.mine) {
          parts.push(builder.string('ownerId').eq(actor.id));
        }
        if (query.q) {
          parts.push(
            builder.string('title').includes(query.q, { mode: 'insensitive' }),
          );
        }
        return parts.length === 1 ? parts[0] : builder.and(parts);
      };
      const [items, total] = await Promise.all([
        repository.findMany({
          ...(needsFilter ? { filter } : {}),
          sort: (sort) => [sort.field('createdAt').desc()],
          limit: query.pageSize,
          offset: (query.page - 1) * query.pageSize,
        }),
        repository.count(needsFilter ? { filter } : {}),
      ]);
      return context.json({ data: { items, total } });
    },
  );

  router.get(
    '/service/tickets/:id',
    describeRoute({
      tags,
      summary: 'Read one service ticket with its logs, shares and attachments',
      operationId: 'serviceTicketsFindOne',
      responses: {
        200: dataResponse(z.record(z.string(), z.unknown())),
        401: apiErrorResponses['401'],
        404: apiErrorResponse(404),
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    async (context) => {
      const { id } = context.req.valid('param');
      const { actor, repository } = await scopedTickets(context);
      const ticket = await repository.findOne({ filter: { id } });
      if (!ticket) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'SERVICE_TICKET_NOT_FOUND',
          domain: 'service',
          message: 'The ticket does not exist or is not visible to you.',
        });
      }
      // The handling log, the share list and the repair attachments are internal
      // records. A read-only observer sees the ticket summary only, so these
      // sections come back empty instead of leaking through an unpolicied
      // repository.
      const internal = await tickets.canViewTicketInternal(id, actor.id);
      // The record scope already hides most tickets from a reader, but a
      // confidential ticket must stay hidden even if its scope rule or its
      // observer flag is misconfigured, so the confidentiality decision is
      // repeated here rather than trusted to the policy alone.
      if (!internal && !(await tickets.canViewTicket(id, actor.id))) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'SERVICE_TICKET_NOT_FOUND',
          domain: 'service',
          message: 'The ticket does not exist or is not visible to you.',
        });
      }
      const supervisor = internal && (await isSupervisor(app, actor.id));
      const [logs, shares, attachments] = internal
        ? await Promise.all([
            tickets.listLogs(id),
            // The share list is supervisor administration, not part of the
            // read-only view a shared engineer or an observer gets.
            supervisor ? tickets.listShares(id) : Promise.resolve([]),
            database.repository('ticket_files').findMany({
              filter: { ticketId: id },
            }),
          ])
        : [[], [], []];
      return context.json({
        data: {
          ticket,
          logs,
          shares,
          attachments,
          access: internal ? 'full' : 'summary',
        },
      });
    },
  );

  router.post(
    '/service/tickets',
    describeRoute({
      tags,
      summary: 'Create a service ticket',
      operationId: 'serviceTicketsCreate',
      responses: {
        201: dataResponse(ticketShape),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('json', createBody),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireCollectionAction(app, actor.id, 'tickets', 'create');
      try {
        const ticket = await tickets.createTicket(context.req.valid('json'), {
          id: actor.id,
          name: actor.name,
        });
        return context.json({ data: ticket }, 201);
      } catch (error) {
        serviceError(error);
      }
    },
  );

  router.post(
    '/service/tickets/:id/accept',
    describeRoute({
      tags,
      summary:
        'Accept or refuse a pending ticket through the acceptance workflow',
      operationId: 'serviceTicketsAccept',
      responses: {
        200: dataResponse(z.record(z.string(), z.unknown())),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    apiValidator('json', acceptBody),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      try {
        const decision = await tickets.requestAcceptance(
          context.req.valid('param').id,
          { id: actor.id, name: actor.name },
          context.req.valid('json'),
        );
        return context.json({ data: decision });
      } catch (error) {
        serviceError(error);
      }
    },
  );

  router.post(
    '/service/tickets/:id/process',
    describeRoute({
      tags,
      summary: 'Move an accepted ticket into processing',
      operationId: 'serviceTicketsStartProcessing',
      responses: {
        200: dataResponse(ticketShape),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    async (context) => {
      const actor = await requireActor(app, context);
      try {
        return context.json({
          data: await tickets.markProcessing(context.req.valid('param').id, {
            id: actor.id,
            name: actor.name,
          }),
        });
      } catch (error) {
        serviceError(error);
      }
    },
  );

  router.post(
    '/service/tickets/:id/assistant-draft',
    describeRoute({
      tags,
      summary: 'Save the assistant suggestion as a draft on a ticket',
      operationId: 'serviceTicketsSaveAssistantDraft',
      responses: {
        200: dataResponse(ticketShape),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        404: apiErrorResponse(404),
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    apiValidator('json', assistantDraftBody),
    async (context) => {
      const actor = await requireActor(app, context);
      const id = context.req.valid('param').id;
      // Saving a draft is a real write to the ticket, so it follows the same
      // record access as reading it: a supervisor may draft on any ticket they
      // can see, the assigned engineer on their own. A read-only observer or a
      // temporarily shared engineer gets a refusal instead of a hidden edit.
      const supervisor = await isSupervisor(app, actor.id);
      if (!supervisor) {
        const internal = await tickets.canViewTicketInternal(id, actor.id);
        if (!internal) {
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'SERVICE_TICKET_NOT_FOUND',
            domain: 'service',
            message: 'The ticket does not exist or is not visible to you.',
          });
        }
        const ticket = await tickets.getTicket(id);
        if (coerceText(ticket.ownerId) !== actor.id) {
          throw new ApiError({
            status: 'PERMISSION_DENIED',
            reason: 'SERVICE_DRAFT_FORBIDDEN',
            domain: 'service',
            message:
              'Only the assigned engineer or a supervisor may save an assistant draft on this ticket.',
          });
        }
      }
      try {
        return context.json({
          data: await tickets.saveAssistantDraft(
            id,
            { id: actor.id, name: actor.name },
            context.req.valid('json'),
          ),
        });
      } catch (error) {
        serviceError(error);
      }
    },
  );

  router.post(
    '/service/tickets/:id/result',
    describeRoute({
      tags,
      summary: 'Submit a repair result and ask the supervisor to confirm',
      operationId: 'serviceTicketsSubmitResult',
      responses: {
        200: dataResponse(ticketShape),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    apiValidator('json', resultBody),
    async (context) => {
      const actor = await requireActor(app, context);
      try {
        return context.json({
          data: await tickets.submitResult(
            context.req.valid('param').id,
            { id: actor.id, name: actor.name },
            context.req.valid('json'),
          ),
        });
      } catch (error) {
        serviceError(error);
      }
    },
  );

  router.post(
    '/service/tickets/:id/confirm',
    describeRoute({
      tags,
      summary: 'Confirm and close a submitted ticket',
      operationId: 'serviceTicketsConfirmClose',
      responses: {
        200: dataResponse(ticketShape),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      try {
        return context.json({
          data: await tickets.confirmClose(context.req.valid('param').id, {
            id: actor.id,
            name: actor.name,
          }),
        });
      } catch (error) {
        serviceError(error);
      }
    },
  );

  router.post(
    '/service/tickets/:id/return',
    describeRoute({
      tags,
      summary: 'Return a submitted ticket to processing',
      operationId: 'serviceTicketsReturn',
      responses: {
        200: dataResponse(ticketShape),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    apiValidator('json', reasonBody),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      try {
        return context.json({
          data: await tickets.returnToProcessing(
            context.req.valid('param').id,
            { id: actor.id, name: actor.name },
            context.req.valid('json').reason,
          ),
        });
      } catch (error) {
        serviceError(error);
      }
    },
  );

  router.post(
    '/service/tickets/:id/reject',
    describeRoute({
      tags,
      summary: 'Reject a pending ticket',
      operationId: 'serviceTicketsReject',
      responses: {
        200: dataResponse(ticketShape),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    apiValidator('json', reasonBody),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      try {
        return context.json({
          data: await tickets.rejectTicket(
            context.req.valid('param').id,
            { id: actor.id, name: actor.name },
            context.req.valid('json').reason,
          ),
        });
      } catch (error) {
        serviceError(error);
      }
    },
  );

  router.post(
    '/service/tickets/:id/visibility',
    describeRoute({
      tags,
      summary: 'Allow or stop read-only observers seeing this ticket',
      operationId: 'serviceTicketsSetObserverVisibility',
      responses: {
        200: dataResponse(ticketShape),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    apiValidator('json', visibilityBody),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      try {
        return context.json({
          data: await tickets.setObserverVisibility(
            context.req.valid('param').id,
            context.req.valid('json').observerVisible,
          ),
        });
      } catch (error) {
        serviceError(error);
      }
    },
  );

  router.get(
    '/service/tickets/:id/logs',
    describeRoute({
      tags,
      summary: 'List acceptance and lifecycle log entries for a ticket',
      operationId: 'serviceTicketsFindLogs',
      responses: {
        200: dataResponse(z.array(z.record(z.string(), z.unknown()))),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    async (context) => {
      const { id } = context.req.valid('param');
      const actor = await requireActor(app, context);
      if (!(await tickets.canViewTicketInternal(id, actor.id))) {
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'SERVICE_TICKET_FORBIDDEN',
          domain: 'service',
          message: 'You may not read this ticket log.',
        });
      }
      return context.json({ data: await tickets.listLogs(id) });
    },
  );

  router.get(
    '/service/tickets/:id/shares',
    describeRoute({
      tags,
      summary: 'List the engineers a ticket is shared with',
      operationId: 'serviceTicketSharesFindMany',
      responses: {
        200: dataResponse(z.array(z.record(z.string(), z.unknown()))),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      return context.json({
        data: await tickets.listShares(context.req.valid('param').id),
      });
    },
  );

  router.post(
    '/service/tickets/:id/shares',
    describeRoute({
      tags,
      summary:
        'Share a non-confidential ticket with an engineer for read-only review',
      operationId: 'serviceTicketSharesCreate',
      responses: {
        201: dataResponse(z.record(z.string(), z.unknown())),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    apiValidator('json', shareBody),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      try {
        const share = await tickets.shareTicket(
          context.req.valid('param').id,
          context.req.valid('json').engineerId,
          { id: actor.id, name: actor.name },
        );
        return context.json({ data: share }, 201);
      } catch (error) {
        serviceError(error);
      }
    },
  );

  router.delete(
    '/service/tickets/:id/shares/:engineerId',
    describeRoute({
      tags,
      summary: 'Revoke a ticket share',
      operationId: 'serviceTicketSharesRevoke',
      responses: {
        204: emptyResponse(),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', engineerParam),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      try {
        await tickets.revokeShare(
          context.req.valid('param').id,
          context.req.valid('param').engineerId,
        );
        return context.body(null, 204);
      } catch (error) {
        serviceError(error);
      }
    },
  );

  router.get(
    '/service/tickets/:id/attachments',
    describeRoute({
      tags,
      summary: 'List repair attachments of one ticket',
      operationId: 'serviceTicketAttachmentsFindMany',
      responses: {
        200: dataResponse(z.array(z.record(z.string(), z.unknown()))),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    async (context) => {
      const { id } = context.req.valid('param');
      const actor = await requireActor(app, context);
      if (!(await tickets.canViewTicketInternal(id, actor.id))) {
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'SERVICE_TICKET_FORBIDDEN',
          domain: 'service',
          message: 'You may not read this ticket.',
        });
      }
      const items = await database.repository('ticket_files').findMany({
        filter: { ticketId: id },
        sort: (sort) => [sort.field('createdAt').desc()],
      });
      return context.json({ data: items });
    },
  );

  router.post(
    '/service/tickets/:id/attachments',
    describeRoute({
      tags,
      summary: 'Link an uploaded file to a ticket',
      operationId: 'serviceTicketAttachmentsCreate',
      responses: {
        201: dataResponse(z.record(z.string(), z.unknown())),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    apiValidator('json', attachBody),
    async (context) => {
      const { id } = context.req.valid('param');
      const body = context.req.valid('json');
      const actor = await requireActor(app, context);
      const ticket = await tickets.getTicket(id).catch(() => undefined);
      if (!ticket) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'SERVICE_TICKET_NOT_FOUND',
          domain: 'service',
          message: 'The ticket does not exist.',
        });
      }
      if (ticket.ownerId !== actor.id && !(await isSupervisor(app, actor.id))) {
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'SERVICE_TICKET_FORBIDDEN',
          domain: 'service',
          message: 'Only the owner or a supervisor may attach files.',
        });
      }
      try {
        await tickets.assertAttachmentContent(body.fileId);
      } catch (error) {
        serviceError(error);
      }
      const { record } = await database.repository('ticket_files').updateOne({
        filter: { id: body.fileId },
        values: touched({ ticketId: id, category: body.category }),
      });
      return context.json({ data: record }, 201);
    },
  );

  router.delete(
    '/service/tickets/:id/attachments/:fileId',
    describeRoute({
      tags,
      summary: 'Remove a repair attachment from a ticket',
      operationId: 'serviceTicketAttachmentsDelete',
      responses: {
        204: emptyResponse(),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', attachParam),
    async (context) => {
      const { id, fileId } = context.req.valid('param');
      const actor = await requireActor(app, context);
      const ticket = await tickets.getTicket(id).catch(() => undefined);
      if (!ticket) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'SERVICE_TICKET_NOT_FOUND',
          domain: 'service',
          message: 'The ticket does not exist.',
        });
      }
      if (ticket.ownerId !== actor.id && !(await isSupervisor(app, actor.id))) {
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'SERVICE_TICKET_FORBIDDEN',
          domain: 'service',
          message: 'Only the owner or a supervisor may remove files.',
        });
      }
      await database.repository('ticket_files').deleteOne({
        filter: { id: fileId, ticketId: id },
      });
      return context.body(null, 204);
    },
  );
}

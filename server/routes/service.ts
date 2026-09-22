import { Hono } from 'hono';
import type { Context } from 'hono';
import { Readable } from 'node:stream';
import type { Application } from '@nocobase/app-server/application';
import { defineApiRoutes } from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import { loggingToken } from '@nocobase/app-server/logging';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  requireCapability,
  resolveCaller,
  sharedTicketIds,
  ticketAccessible,
  type ServiceCaller,
  type TicketScopeRow,
} from '../services/service-auth.js';
import { ServiceRuleError, TicketService } from '../services/tickets.js';
import { CatalogService } from '../services/catalog.js';
import { DashboardService } from '../services/dashboard.js';
import { InspectionService, todayInShanghai } from '../services/inspections.js';
import { AssistantService } from '../services/assistant.js';
import { AutomationService } from '../services/automation.js';

export interface StoredFileRow {
  id: string;
  disk: string;
  key: string;
  filename: string;
  mimeType: string | null;
  size: number | string | null;
}

function statusOf(error: unknown): number {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    if (Number.isFinite(status) && status >= 400 && status < 600) return status;
  }
  return 500;
}

export default defineApiRoutes((app: Application) => {
  const router = new Hono();
  const auth = app.container.resolve(authenticationToken);
  const authorization = app.container.resolve(authorizationToken);

  // Scoped to the paths this contribution owns, never `*`, so it cannot apply
  // to another contribution mounted later.
  router.use('/service/*', auth.required());
  router.use('/service/*', authorization.middleware());

  const tickets = new TicketService(app);
  const catalog = new CatalogService(app);
  const dashboard = new DashboardService(app);
  const inspections = new InspectionService(app);
  const assistant = new AssistantService(app);
  const automation = new AutomationService(app);

  // Automatic acceptance is a side effect of a ticket operation. It records its
  // own run for the execution view, but a problem recording it must never fail
  // the ticket change that already committed.
  const triggerAutomation = async (
    ticket: Parameters<AutomationService['runAcceptance']>[0],
    triggeredBy: string,
  ): Promise<void> => {
    try {
      await automation.runAcceptance(ticket, triggeredBy);
    } catch (error) {
      if (app.container.has(loggingToken))
        app.container
          .resolve(loggingToken)
          .getLogger()
          .warn(
            { error: error instanceof Error ? error.message : String(error) },
            'Automatic acceptance run could not be recorded',
          );
    }
  };

  const handle =
    (
      handler: (context: Context, caller: ServiceCaller) => Promise<unknown>,
      options: { status?: number } = {},
    ) =>
    async (context: Context) => {
      try {
        const caller = await resolveCaller(app, context);
        const data = await handler(context, caller);
        return context.json({ data }, (options.status ?? 200) as 200);
      } catch (error) {
        const status = statusOf(error);
        return context.json(
          {
            errors: [
              {
                message:
                  error instanceof Error ? error.message : 'Unexpected error',
                code: status,
              },
            ],
          },
          status as 400,
        );
      }
    };

  const body = async (context: Context) =>
    (await context.req.json().catch(() => ({}))) as Record<string, unknown>;
  const num = (value: unknown, fallback?: number): number | undefined => {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  // Reads a request value as text without ever stringifying an object.
  const text = (value: unknown, fallback = ''): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    return fallback;
  };

  router.get(
    '/service/bootstrap',
    handle(async (_context, caller) => ({
      caller,
      today: todayInShanghai(),
    })),
  );

  router.get(
    '/service/dashboard',
    handle(async (_context, caller) => dashboard.summary(caller)),
  );

  // Tickets -----------------------------------------------------------------
  router.get(
    '/service/tickets',
    handle(async (context, caller) =>
      tickets.list(caller, {
        status: context.req.query('status') || undefined,
        region: context.req.query('region') || undefined,
        search: context.req.query('search') || undefined,
        assigneeId: context.req.query('assigneeId') || undefined,
        page: num(context.req.query('page'), 1),
        pageSize: num(context.req.query('pageSize'), 20),
      }),
    ),
  );

  router.post(
    '/service/tickets',
    handle(
      async (context, caller) => {
        const payload = await body(context);
        const ticket = await tickets.create(caller, {
          customerId: Number(payload.customerId),
          deviceId: Number(payload.deviceId),
          title: text(payload.title, ''),
          description: payload.description
            ? text(payload.description)
            : undefined,
          priority: payload.priority ? text(payload.priority) : undefined,
          confidential: Boolean(payload.confidential),
          submit: Boolean(payload.submit),
          reporterName: payload.reporterName
            ? text(payload.reporterName)
            : undefined,
        });
        // A freshly submitted ticket runs the automatic acceptance process; a
        // saved draft does not.
        if (payload.submit)
          await triggerAutomation(ticket, `manual:${caller.name}`);
        return ticket;
      },
      { status: 201 },
    ),
  );

  router.get(
    '/service/tickets/:id',
    handle(async (context, caller) =>
      tickets.detail(caller, Number(context.req.param('id'))),
    ),
  );

  router.post(
    '/service/tickets/:id/actions/:action',
    handle(async (context, caller) => {
      const payload = await body(context);
      const result = await tickets.transition(
        caller,
        Number(context.req.param('id')),
        context.req.param('action') as never,
        {
          assigneeId: payload.assigneeId ? text(payload.assigneeId) : undefined,
          note: payload.note ? text(payload.note) : undefined,
          reason: payload.reason ? text(payload.reason) : undefined,
          laborHours: num(payload.laborHours),
          resolution: payload.resolution ? text(payload.resolution) : undefined,
          region: payload.region ? text(payload.region) : undefined,
          priority: payload.priority ? text(payload.priority) : undefined,
          confidential:
            payload.confidential === undefined
              ? undefined
              : Boolean(payload.confidential),
        },
      );
      if (
        context.req.param('action') === 'submit' &&
        !result.idempotent &&
        result.ticket
      ) {
        await triggerAutomation(result.ticket, `manual:${caller.name}`);
      }
      return result;
    }),
  );

  // Automatic acceptance execution records --------------------------------
  router.get(
    '/service/automation-runs',
    handle(async (context, caller) =>
      automation.listRuns(caller, {
        page: num(context.req.query('page'), 1),
        pageSize: num(context.req.query('pageSize'), 20),
      }),
    ),
  );

  router.get(
    '/service/tickets/:id/automation-runs',
    handle(async (context, caller) =>
      automation.listRuns(caller, {
        ticketId: Number(context.req.param('id')),
      }),
    ),
  );

  router.post(
    '/service/tickets/:id/automation-runs/retry',
    handle(async (context, caller) =>
      automation.retry(caller, Number(context.req.param('id'))),
    ),
  );

  router.post(
    '/service/tickets/:id/shares',
    handle(async (context, caller) => {
      const payload = await body(context);
      return tickets.share(
        caller,
        Number(context.req.param('id')),
        text(payload.userId, ''),
        payload.active === undefined ? true : Boolean(payload.active),
      );
    }),
  );

  router.post(
    '/service/tickets/:id/files',
    handle(async (context, caller) => {
      const payload = await body(context);
      const fileIds = Array.isArray(payload.fileIds)
        ? payload.fileIds.map((id) => text(id))
        : [];
      return tickets.attachFiles(
        caller,
        Number(context.req.param('id')),
        fileIds,
        payload.category ? text(payload.category) : 'attachment',
      );
    }),
  );

  // Customers ---------------------------------------------------------------
  router.get(
    '/service/customers',
    handle(async (context, caller) =>
      catalog.listCustomers(caller, {
        search: context.req.query('search') || undefined,
        region: context.req.query('region') || undefined,
        page: num(context.req.query('page'), 1),
        pageSize: num(context.req.query('pageSize'), 20),
      }),
    ),
  );

  router.post(
    '/service/customers',
    handle(async (context, caller) => {
      const payload = await body(context);
      return catalog.saveCustomer(caller, {
        id: num(payload.id),
        name: text(payload.name, ''),
        region: text(payload.region, 'east'),
        contactName: payload.contactName
          ? text(payload.contactName)
          : undefined,
        contactPhone: payload.contactPhone
          ? text(payload.contactPhone)
          : undefined,
        address: payload.address ? text(payload.address) : undefined,
        status: payload.status ? text(payload.status) : undefined,
      });
    }),
  );

  router.get(
    '/service/customers/:id',
    handle(async (context, caller) =>
      catalog.customerDetail(caller, Number(context.req.param('id'))),
    ),
  );

  // Devices -----------------------------------------------------------------
  router.get(
    '/service/devices',
    handle(async (context, caller) =>
      catalog.listDevices(caller, {
        search: context.req.query('search') || undefined,
        region: context.req.query('region') || undefined,
        customerId: num(context.req.query('customerId')),
        page: num(context.req.query('page'), 1),
        pageSize: num(context.req.query('pageSize'), 20),
      }),
    ),
  );

  router.post(
    '/service/devices',
    handle(async (context, caller) => {
      const payload = await body(context);
      return catalog.saveDevice(caller, {
        id: num(payload.id),
        code: text(payload.code, ''),
        name: text(payload.name, ''),
        customerId: Number(payload.customerId),
        region: text(payload.region, 'east'),
        category: payload.category ? text(payload.category) : undefined,
        model: payload.model ? text(payload.model) : undefined,
        serialNumber: payload.serialNumber
          ? text(payload.serialNumber)
          : undefined,
        ownerId: payload.ownerId ? text(payload.ownerId) : undefined,
        enabled:
          payload.enabled === undefined ? true : Boolean(payload.enabled),
      });
    }),
  );

  // Knowledge ---------------------------------------------------------------
  router.get(
    '/service/knowledge',
    handle(async (context, caller) =>
      catalog.listKnowledge(caller, {
        search: context.req.query('search') || undefined,
        category: context.req.query('category') || undefined,
        status: context.req.query('status') || undefined,
        page: num(context.req.query('page'), 1),
        pageSize: num(context.req.query('pageSize'), 20),
      }),
    ),
  );

  router.post(
    '/service/knowledge',
    handle(async (context, caller) => {
      const payload = await body(context);
      return catalog.saveKnowledge(caller, {
        id: num(payload.id),
        title: text(payload.title, ''),
        deviceCategory: payload.deviceCategory
          ? text(payload.deviceCategory)
          : undefined,
        summary: payload.summary ? text(payload.summary) : undefined,
        body: payload.body ? text(payload.body) : undefined,
        status: payload.status ? text(payload.status) : undefined,
      });
    }),
  );

  router.get(
    '/service/knowledge/:id',
    handle(async (context, caller) =>
      catalog.knowledgeDetail(caller, Number(context.req.param('id'))),
    ),
  );

  router.post(
    '/service/knowledge/:id/files',
    handle(async (context, caller) => {
      const payload = await body(context);
      const fileIds = Array.isArray(payload.fileIds)
        ? payload.fileIds.map((value) => text(value))
        : [];
      return catalog.attachKnowledgeFiles(
        caller,
        Number(context.req.param('id')),
        fileIds,
      );
    }),
  );

  // Inspections -------------------------------------------------------------
  router.get(
    '/service/inspections',
    handle(async (context, caller) =>
      inspections.list(caller, {
        date: context.req.query('date') || undefined,
        status: context.req.query('status') || undefined,
        region: context.req.query('region') || undefined,
        page: num(context.req.query('page'), 1),
        pageSize: num(context.req.query('pageSize'), 50),
      }),
    ),
  );

  router.post(
    '/service/inspections/generate',
    handle(async (context, caller) => {
      await requireCapability(caller, 'inspections.manage');
      const payload = await body(context);
      return inspections.generate({
        planId: num(payload.planId),
        date: payload.date ? text(payload.date) : undefined,
        triggeredBy: `manual:${caller.name}`,
      });
    }),
  );

  router.get(
    '/service/inspections/plans',
    handle(async (_context, caller) => inspections.listPlans(caller)),
  );

  router.post(
    '/service/inspections/plans/:id',
    handle(async (context, caller) => {
      const payload = await body(context);
      return inspections.setPlanEnabled(
        caller,
        Number(context.req.param('id')),
        payload.enabled === undefined ? true : Boolean(payload.enabled),
      );
    }),
  );

  router.post(
    '/service/inspections/plans/:id/run',
    handle(async (context, caller) => {
      const payload = await body(context);
      return inspections.runPlan(
        caller,
        Number(context.req.param('id')),
        payload.date ? text(payload.date) : undefined,
      );
    }),
  );

  router.get(
    '/service/inspections/runs',
    handle(async (context, caller) =>
      inspections.listRuns(caller, {
        page: num(context.req.query('page'), 1),
        pageSize: num(context.req.query('pageSize'), 20),
      }),
    ),
  );

  router.post(
    '/service/inspections/:id/complete',
    handle(async (context, caller) => {
      const payload = await body(context);
      return inspections.complete(
        caller,
        Number(context.req.param('id')),
        payload.note ? text(payload.note) : undefined,
      );
    }),
  );

  // Assistant ---------------------------------------------------------------
  router.get(
    '/service/assistant/conversations',
    handle(async (_context, caller) => assistant.listConversations(caller)),
  );

  router.post(
    '/service/assistant/conversations',
    handle(async (context, caller) => {
      const payload = await body(context);
      return assistant.createConversation(
        caller,
        payload.title ? text(payload.title) : undefined,
      );
    }),
  );

  router.get(
    '/service/assistant/conversations/:id',
    handle(async (context, caller) =>
      assistant.detail(caller, Number(context.req.param('id'))),
    ),
  );

  router.post(
    '/service/assistant/conversations/:id/messages',
    handle(async (context, caller) => {
      const payload = await body(context);
      return assistant.ask(
        caller,
        Number(context.req.param('id')),
        text(payload.question, ''),
      );
    }),
  );

  // Members -----------------------------------------------------------------
  router.get(
    '/service/members/candidates',
    handle(async (_context, caller) => catalog.listMemberCandidates(caller)),
  );

  router.get(
    '/service/members',
    handle(async (_context, caller) => catalog.listMembers(caller)),
  );

  router.post(
    '/service/members',
    handle(async (context, caller) => {
      const payload = await body(context);
      return catalog.saveMember(caller, {
        id: num(payload.id),
        userId: text(payload.userId, ''),
        region: text(payload.region, 'none'),
        teamName: payload.teamName ? text(payload.teamName) : undefined,
      });
    }),
  );

  // External device-platform integration ------------------------------------
  router.post(
    '/service/integration/device-events',
    handle(async (context, caller) => {
      await requireCapability(caller, 'integration.consume');
      const payload = await body(context);
      const deviceCode = text(payload.deviceCode, '');
      const eventId = text(payload.eventId, '');
      if (!deviceCode || !eventId)
        throw new ServiceRuleError('deviceCode and eventId are required');
      const device = await app.container
        .resolve(databaseManagerToken)
        .query()
        .selectFrom('serviceDevices')
        .selectAll()
        .where('code', '=', deviceCode)
        .executeTakeFirst();
      if (!device) throw new ServiceRuleError('Unknown device', 404);
      const ticket = await tickets.create(caller, {
        customerId: Number(device.customerId),
        deviceId: Number(device.id),
        title: payload.title ? text(payload.title) : `设备告警：${deviceCode}`,
        description: payload.description
          ? text(payload.description)
          : undefined,
        priority: payload.priority ? text(payload.priority) : 'high',
        submit: true,
        source: 'integration',
        externalEventId: eventId,
        reporterName: '设备平台 / Device platform',
      });
      // The acceptance process is deduplicated by the ticket's own state: a
      // repeated external event returns the existing ticket, which is no longer
      // pending dispatch.
      if (String(ticket.status) === 'pending_dispatch')
        await triggerAutomation(ticket, 'integration');
      return ticket;
    }),
  );

  // File content -------------------------------------------------------------
  router.get('/service/files/:id/content', async (context) => {
    try {
      const caller = await resolveCaller(app, context);
      const fileId = context.req.param('id');
      const database = app.container.resolve(databaseManagerToken);
      const file = (await database
        .query()
        .selectFrom('serviceFiles')
        .selectAll()
        .where('id', '=', fileId)
        .executeTakeFirst()) as unknown as StoredFileRow | undefined;
      if (!file)
        return context.json(
          { errors: [{ message: 'File not found', code: 404 }] },
          404,
        );
      await assertFileAccessible(app, caller, fileId);
      const disk = app.container.resolve(driveManagerToken).use(file.disk);
      if (!(await disk.exists(file.key)))
        return context.json(
          { errors: [{ message: 'File content is missing', code: 404 }] },
          404,
        );
      const mimeType = file.mimeType || 'application/octet-stream';
      const inline =
        mimeType.startsWith('image/') || mimeType === 'application/pdf';
      context.header('Content-Type', mimeType);
      context.header('Content-Length', String(file.size ?? 0));
      context.header('X-Content-Type-Options', 'nosniff');
      context.header('Content-Security-Policy', "sandbox; default-src 'none'");
      context.header(
        'Content-Disposition',
        `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      );
      return context.body(
        Readable.toWeb(await disk.getStream(file.key)) as ReadableStream,
      );
    } catch (error) {
      const status = statusOf(error);
      return context.json(
        {
          errors: [
            {
              message:
                error instanceof Error ? error.message : 'Unexpected error',
              code: status,
            },
          ],
        },
        status as 400,
      );
    }
  });

  return router;
});

/**
 * A file is reachable when the caller can reach a ticket or knowledge article
 * that references it. An unattached file is reachable by an author who can
 * still attach it, and by no one else.
 */
async function assertFileAccessible(
  app: Application,
  caller: ServiceCaller,
  fileId: string,
): Promise<void> {
  const database = app.container.resolve(databaseManagerToken);
  const query = database.query();
  const ticketLinks = await query
    .selectFrom('serviceTicketFiles')
    .select('ticketId')
    .where('fileId', '=', fileId)
    .execute();
  const knowledgeLinks = await query
    .selectFrom('serviceKnowledgeFiles')
    .select('knowledgeId')
    .where('fileId', '=', fileId)
    .execute();

  if (!ticketLinks.length && !knowledgeLinks.length) {
    if (
      caller.capabilities['tickets.edit'] ||
      caller.capabilities['knowledge.manage']
    )
      return;
    throw new ServiceRuleError('File is not accessible', 404);
  }
  if (knowledgeLinks.length && caller.capabilities['knowledge.view']) return;
  if (ticketLinks.length && caller.capabilities['tickets.view']) {
    const ticketIds = ticketLinks.map((link) => Number(link.ticketId));
    const tickets = (await query
      .selectFrom('serviceTickets')
      .selectAll()
      .where('id', 'in', ticketIds)
      .execute()) as unknown as TicketScopeRow[];
    const shared = await sharedTicketIds(database, caller.id);
    for (const ticket of tickets) {
      if (await ticketAccessible(caller, ticket, shared)) return;
    }
  }
  throw new ServiceRuleError('File is not accessible', 404);
}

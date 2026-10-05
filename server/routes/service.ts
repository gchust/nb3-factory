/**
 * HTTP surface of the after-sales service domain.
 *
 * Every path below owns its own authentication: the router installs
 * `auth.required()` on `/service/*` before any handler, and each handler asks
 * the domain to authorize the operation. Mounting under `/api` authenticates
 * nothing by itself, so the guard is explicit and scoped to exactly this
 * router's prefix.
 *
 * The handlers stay thin on purpose — parse the request, resolve the actor,
 * call one domain operation, translate a `ServiceError` into its status. All
 * business rules live in `server/providers/service/`.
 */
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Application } from '@nocobase/app-server/application';
import { defineApiRoutes } from '@nocobase/app-server/router';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';

import {
  ServiceError,
  badRequest,
  notFound,
} from '../providers/service/errors.js';
import { serviceOperationsToken } from '../providers/service/tokens.js';
import { num, str, type ServiceActor } from '../providers/service/types.js';

type JsonObject = Record<string, unknown>;

/** Read the JSON body, treating a missing or malformed body as an empty one. */
async function body(context: Context): Promise<JsonObject> {
  try {
    const value: unknown = await context.req.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as JsonObject)
      : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function currentUser(
  context: Context,
): { id?: unknown; name?: unknown; email?: unknown } | null {
  const holder = context as unknown as { get(key: string): unknown };
  const session = holder.get('auth');
  if (!isRecord(session) || !('user' in session)) {
    return null;
  }
  const user = session.user;
  return isRecord(user)
    ? { id: user.id, name: user.name, email: user.email }
    : null;
}

/** Parse a positive integer route parameter, failing with the domain's 400. */
function routeId(context: Context, name: string): number {
  const value = num(context.req.param(name));
  if (value === null || value < 0) {
    throw badRequest(`A valid ${name} is required`);
  }
  return value;
}

function pageParams(context: Context): {
  page?: number;
  pageSize?: number;
} {
  const page = num(context.req.query('page'));
  const pageSize = num(context.req.query('pageSize'));
  return {
    ...(page === null ? {} : { page }),
    ...(pageSize === null ? {} : { pageSize }),
  };
}

function optionalNumber(context: Context, key: string): number | undefined {
  const value = num(context.req.query(key));
  return value === null ? undefined : value;
}

function optionalBoolean(context: Context, key: string): boolean | undefined {
  const value = context.req.query(key);
  if (value === undefined || value === '') return undefined;
  return value === 'true' || value === '1';
}

function fail(context: Context, error: unknown): Response {
  if (error instanceof ServiceError) {
    return context.json(
      { error: { code: error.code, message: error.message } },
      error.status as ContentfulStatusCode,
    );
  }
  throw error;
}

export const serviceRoutes = defineApiRoutes<Application>((app) => {
  const router = new Hono();
  const auth = app.container.resolve(authenticationToken);
  const operations = app.container.resolve(serviceOperationsToken);
  const drive = app.container.resolve(driveManagerToken);

  router.use('/service/*', auth.required());

  /** Resolve the actor and run one operation, translating domain errors. */
  const run = async (
    context: Context,
    handler: (actor: ServiceActor) => Promise<unknown>,
  ): Promise<Response> => {
    try {
      const actor = await operations.resolveActor(currentUser(context));
      return context.json({ data: await handler(actor) });
    } catch (error) {
      return fail(context, error);
    }
  };

  // -------------------------------------------------------------- identity

  router.get('/service/me', (context) =>
    run(context, async (actor) => ({
      userId: actor.userId,
      name: actor.name,
      email: actor.email,
      roles: actor.roles,
      role: actor.roles[0] ?? null,
      memberId: actor.memberId,
      memberGroupId: actor.memberGroupId,
    })),
  );

  router.get('/service/dashboard', (context) =>
    run(context, (actor) => operations.dashboard(actor)),
  );

  // ------------------------------------------------------------- customers

  router.get('/service/customers', (context) =>
    run(context, (actor) =>
      operations.listCustomers(actor, {
        search: context.req.query('search') ?? '',
        ...pageParams(context),
      }),
    ),
  );

  router.post('/service/customers', (context) =>
    run(context, async (actor) =>
      operations.createCustomer(actor, await body(context)),
    ),
  );

  router.patch('/service/customers/:id', (context) =>
    run(context, async (actor) =>
      operations.updateCustomer(
        actor,
        routeId(context, 'id'),
        await body(context),
      ),
    ),
  );

  // ------------------------------------------------------------- equipment

  router.get('/service/equipment', (context) =>
    run(context, (actor) =>
      operations.listEquipment(actor, {
        search: context.req.query('search') ?? '',
        customerId: optionalNumber(context, 'customerId'),
        enabled: optionalBoolean(context, 'enabled'),
        ...pageParams(context),
      }),
    ),
  );

  router.get('/service/equipment/:id', (context) =>
    run(context, (actor) =>
      operations.getEquipment(actor, routeId(context, 'id')),
    ),
  );

  router.post('/service/equipment', (context) =>
    run(context, async (actor) =>
      operations.createEquipment(actor, await body(context)),
    ),
  );

  router.patch('/service/equipment/:id', (context) =>
    run(context, async (actor) =>
      operations.updateEquipment(
        actor,
        routeId(context, 'id'),
        await body(context),
      ),
    ),
  );

  router.get('/service/engineers', (context) =>
    run(context, (actor) => operations.listEngineers(actor)),
  );

  // ------------------------------------------------------------ work orders

  router.get('/service/work-orders', (context) =>
    run(context, (actor) =>
      operations.listWorkOrders(actor, {
        search: context.req.query('search') ?? '',
        status: context.req.query('status') ?? '',
        priority: context.req.query('priority') ?? '',
        assigneeId: optionalNumber(context, 'assigneeId'),
        customerId: optionalNumber(context, 'customerId'),
        equipmentId: optionalNumber(context, 'equipmentId'),
        ...pageParams(context),
      }),
    ),
  );

  router.get('/service/work-orders/:id', (context) =>
    run(context, (actor) =>
      operations.getWorkOrder(actor, routeId(context, 'id')),
    ),
  );

  router.post('/service/work-orders', (context) =>
    run(context, async (actor) =>
      operations.createWorkOrder(actor, await body(context)),
    ),
  );

  router.post('/service/work-orders/:id/accept', (context) =>
    run(context, (actor) =>
      operations.acceptWorkOrder(actor, routeId(context, 'id')),
    ),
  );

  router.post('/service/work-orders/:id/retry-acceptance', (context) =>
    run(context, (actor) =>
      operations.retryAcceptance(actor, routeId(context, 'id')),
    ),
  );

  router.post('/service/work-orders/:id/start', (context) =>
    run(context, (actor) =>
      operations.startWorkOrder(actor, routeId(context, 'id')),
    ),
  );

  router.post('/service/work-orders/:id/resolution', (context) =>
    run(context, async (actor) =>
      operations.submitResolution(
        actor,
        routeId(context, 'id'),
        str((await body(context)).resolution),
      ),
    ),
  );

  router.post('/service/work-orders/:id/close', (context) =>
    run(context, async (actor) =>
      operations.closeWorkOrder(
        actor,
        routeId(context, 'id'),
        str((await body(context)).note),
      ),
    ),
  );

  router.post('/service/work-orders/:id/reject', (context) =>
    run(context, async (actor) =>
      operations.rejectWorkOrder(
        actor,
        routeId(context, 'id'),
        str((await body(context)).reason),
      ),
    ),
  );

  // --------------------------------------------------- temporary sharing

  router.get('/service/work-orders/:id/shares', (context) =>
    run(context, (actor) =>
      operations.listShares(actor, routeId(context, 'id')),
    ),
  );

  router.post('/service/work-orders/:id/shares', (context) =>
    run(context, async (actor) =>
      operations.createShare(
        actor,
        routeId(context, 'id'),
        await body(context),
      ),
    ),
  );

  router.post('/service/work-orders/:id/shares/:shareId/revoke', (context) =>
    run(context, (actor) =>
      operations.revokeShare(
        actor,
        routeId(context, 'id'),
        routeId(context, 'shareId'),
      ),
    ),
  );

  // ------------------------------------------------------------ inspections

  router.get('/service/inspections', (context) =>
    run(context, (actor) =>
      operations.listInspections(actor, {
        status: context.req.query('status') ?? '',
        engineerMemberId: optionalNumber(context, 'engineerMemberId'),
        equipmentId: optionalNumber(context, 'equipmentId'),
        ...pageParams(context),
      }),
    ),
  );

  router.post('/service/inspections/:id/start', (context) =>
    run(context, (actor) =>
      operations.startInspection(actor, routeId(context, 'id')),
    ),
  );

  router.post('/service/inspections/:id/complete', (context) =>
    run(context, async (actor) =>
      operations.completeInspection(
        actor,
        routeId(context, 'id'),
        str((await body(context)).result),
      ),
    ),
  );

  // -------------------------------------------------------------- knowledge

  router.get('/service/knowledge', (context) =>
    run(context, (actor) =>
      operations.listKnowledge(actor, {
        search: context.req.query('search') ?? '',
        published: optionalBoolean(context, 'published'),
        ...pageParams(context),
      }),
    ),
  );

  router.get('/service/knowledge/:id', (context) =>
    run(context, (actor) =>
      operations.getKnowledge(actor, routeId(context, 'id')),
    ),
  );

  router.post('/service/knowledge', (context) =>
    run(context, async (actor) =>
      operations.createKnowledge(actor, await body(context)),
    ),
  );

  router.patch('/service/knowledge/:id', (context) =>
    run(context, async (actor) =>
      operations.updateKnowledge(
        actor,
        routeId(context, 'id'),
        await body(context),
      ),
    ),
  );

  // ---------------------------------------------------------------- manuals

  router.get('/service/manuals', (context) =>
    run(context, (actor) =>
      operations.listManuals(actor, {
        search: context.req.query('search') ?? '',
        ...pageParams(context),
      }),
    ),
  );

  router.get('/service/manuals/:id', (context) =>
    run(context, (actor) =>
      operations.getManual(actor, routeId(context, 'id')),
    ),
  );

  router.post('/service/manuals', (context) =>
    run(context, async (actor) =>
      operations.createManual(actor, await body(context)),
    ),
  );

  router.patch('/service/manuals/:id', (context) =>
    run(context, async (actor) =>
      operations.updateManual(
        actor,
        routeId(context, 'id'),
        await body(context),
      ),
    ),
  );

  router.post('/service/manuals/:id/reindex', (context) =>
    run(context, (actor) =>
      operations.reindexManual(actor, routeId(context, 'id')),
    ),
  );

  router.delete('/service/manuals/:id', (context) =>
    run(context, (actor) =>
      operations.deleteManual(actor, routeId(context, 'id')),
    ),
  );

  // ------------------------------------------------------------ attachments

  router.get('/service/work-orders/:id/attachments', (context) =>
    run(context, (actor) =>
      operations.listAttachments(actor, routeId(context, 'id')),
    ),
  );

  router.post('/service/work-orders/:id/attachments', (context) =>
    run(context, async (actor) =>
      operations.registerAttachment(
        actor,
        routeId(context, 'id'),
        await body(context),
      ),
    ),
  );

  router.delete('/service/work-orders/:id/attachments/:fileId', (context) =>
    run(context, (actor) =>
      operations.detachAttachment(
        actor,
        routeId(context, 'id'),
        context.req.param('fileId'),
      ),
    ),
  );

  /**
   * Serve the bytes of an attachment recorded against a work order.
   *
   * The file plugin's own content route is public by design, so the business
   * files are read through this authenticated route instead: it asks the
   * domain whether this caller may read the work order the file belongs to,
   * then streams the bytes from the configured disk.
   */
  router.get('/service/attachments/:id/content', async (context) => {
    try {
      const actor = await operations.resolveActor(currentUser(context));
      const fileId = context.req.param('id');
      const file = await operations.assertAttachmentRead(actor, fileId);
      if (!file) {
        throw notFound('The attachment was not found');
      }
      const bytes = await drive
        .use(str(file.disk) || 'local')
        .getBytes(str(file.key));
      const filename = str(file.filename) || fileId;
      return context.body(new Uint8Array(bytes).buffer, 200, {
        'content-type': str(file.mimeType) || 'application/octet-stream',
        'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'cache-control': 'private, max-age=60',
      });
    } catch (error) {
      return fail(context, error);
    }
  });

  // -------------------------------------------------------------- integration

  router.get('/service/integration', (context) =>
    run(context, (actor) => operations.integrationStatus(actor)),
  );

  router.get('/service/external-events', (context) =>
    run(context, (actor) =>
      operations.listExternalEvents(actor, {
        status: context.req.query('status') ?? '',
        ...pageParams(context),
      }),
    ),
  );

  router.post('/service/external/repairs', (context) =>
    run(context, async (actor) =>
      operations.submitExternalRepair(actor, await body(context)),
    ),
  );

  /**
   * The device platform's read-only follow-up on a repair it submitted. The
   * key's session resolves to the integration account, so the caller sees only
   * its own repairs.
   */
  router.get('/service/external/repairs/:id', (context) =>
    run(context, (actor) =>
      operations.readExternalRepair(actor, routeId(context, 'id')),
    ),
  );

  // ------------------------------------------------------ integration account

  router.get('/service/integration/account', (context) =>
    run(context, (actor) => operations.integrationAccountStatus(actor)),
  );

  router.post('/service/integration/keys', (context) =>
    run(context, async (actor) =>
      operations.createIntegrationApiKey(actor, await body(context)),
    ),
  );

  router.delete('/service/integration/keys/:id', (context) =>
    run(context, (actor) =>
      operations.revokeIntegrationApiKey(actor, context.req.param('id') ?? ''),
    ),
  );

  // --------------------------------------------------------- execution plans

  router.get('/service/schedules', (context) =>
    run(context, (actor) => operations.getSchedules(actor)),
  );

  /**
   * Runs the plan, not a copy of the operation: the registered Scheduler target
   * executes it and the run is recorded as one of the plan's own occurrences.
   */
  router.post('/service/schedules/:job/run', (context) =>
    run(context, (actor) =>
      operations.runScheduledJob(actor, context.req.param('job') ?? ''),
    ),
  );

  return router;
});

export default serviceRoutes;

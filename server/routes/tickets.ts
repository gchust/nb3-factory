import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import {
  TICKET_STATUSES,
  TicketError,
  ticketServiceToken,
  type TicketActor,
  type TicketErrorCode,
  type TicketRole,
  type TicketStatus,
} from '../providers/tickets.js';

/**
 * `/api/tickets` — the IT repair desk.
 *
 * Every path installed here is authenticated and carries an authorization
 * context, and every handler resolves the caller's role from their effective
 * permission sets before touching data. The server, not the browser, decides
 * who may list, read, start or complete: an employee's list is scoped to rows
 * they submitted, a guessed id resolves to nothing, and only a handler can
 * advance a ticket. Mounting under `/api` authenticates nothing by itself, so
 * both middlewares are declared on this sub-router and nowhere else.
 */

const ERROR_STATUS: Record<TicketErrorCode, ContentfulStatusCode> = {
  TICKET_NOT_FOUND: 404,
  TICKET_FORBIDDEN: 403,
  TICKET_INVALID_INPUT: 400,
  TICKET_RESOLUTION_REQUIRED: 400,
  TICKET_INVALID_STATUS: 409,
};

type Env = AuthEnv & AuthorizationEnv;

function errorBody(error: TicketError): { code: string; message: string } {
  return { code: error.code, message: error.message };
}

function respondError(
  context: Context<Env>,
  error: unknown,
): Response | Promise<Response> {
  if (error instanceof TicketError) {
    return context.json(errorBody(error), ERROR_STATUS[error.code]);
  }
  throw error;
}

async function readBody(
  context: Context<Env>,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // A missing or malformed body is reported as invalid input below.
  }
  throw new TicketError('TICKET_INVALID_INPUT', 'A JSON body is required.');
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const tickets = app.container.resolve(ticketServiceToken);

    const router = new Hono<Env>();

    /**
     * The caller's IT role, read from the permission sets they actually hold.
     * `tickets-handler` wins over `tickets-employee`; an administrator whose
     * access is unrestricted acts as a handler. A signed-in colleague with
     * neither set has no role and is refused.
     */
    async function resolveActor(
      context: Context<Env>,
      user: { id: string; name?: string | null; email?: string | null },
    ): Promise<TicketActor | undefined> {
      const requestAuthz = context.get('authz');
      const snapshot = await requestAuthz.snapshot();
      const userName = user.name ?? user.email ?? user.id;
      if (snapshot.unrestricted) {
        return { userId: user.id, userName, role: 'admin' };
      }
      const sets = await authorization.permissionSets.getEffective(
        requestAuthz.identity,
      );
      const keys = new Set(sets.map((set) => set.key));
      const role: TicketRole | undefined = keys.has('tickets-handler')
        ? 'handler'
        : keys.has('tickets-employee')
          ? 'employee'
          : undefined;
      if (!role) {
        return undefined;
      }
      return { userId: user.id, userName, role };
    }

    async function requireActor(context: Context<Env>): Promise<TicketActor> {
      const session = context.get('auth');
      if (!session) {
        throw new TicketError('TICKET_FORBIDDEN', 'Sign in is required.');
      }
      const actor = await resolveActor(context, session.user);
      if (!actor) {
        throw new TicketError(
          'TICKET_FORBIDDEN',
          'Your account has no IT repair role assigned.',
        );
      }
      return actor;
    }

    function meta(actor: TicketActor) {
      return {
        role: actor.role,
        canCreate: true,
        canProcess: actor.role !== 'employee',
      };
    }

    router.use('*', auth.required());
    router.use('*', authorization.middleware());

    router.get('/', async (context) => {
      try {
        const actor = await requireActor(context);
        const requested = context.req.query('status');
        let status: TicketStatus | undefined;
        if (requested) {
          if (!TICKET_STATUSES.includes(requested as TicketStatus)) {
            throw new TicketError(
              'TICKET_INVALID_INPUT',
              'Unknown ticket status filter.',
            );
          }
          status = requested as TicketStatus;
        }
        const data = await tickets.list(actor, status ? { status } : undefined);
        return context.json({ data, meta: meta(actor) });
      } catch (error) {
        return respondError(context, error);
      }
    });

    router.post('/', async (context) => {
      try {
        const actor = await requireActor(context);
        const body = await readBody(context);
        const data = await tickets.create(actor, {
          title: typeof body.title === 'string' ? body.title : '',
          category: body.category as never,
          description:
            typeof body.description === 'string' ? body.description : undefined,
        });
        return context.json({ data, meta: meta(actor) }, 201);
      } catch (error) {
        return respondError(context, error);
      }
    });

    router.get('/:id', async (context) => {
      try {
        const actor = await requireActor(context);
        const data = await tickets.get(actor, context.req.param('id'));
        return context.json({ data, meta: meta(actor) });
      } catch (error) {
        return respondError(context, error);
      }
    });

    router.post('/:id/start', async (context) => {
      try {
        const actor = await requireActor(context);
        const data = await tickets.start(actor, context.req.param('id'));
        return context.json({ data, meta: meta(actor) });
      } catch (error) {
        return respondError(context, error);
      }
    });

    router.post('/:id/complete', async (context) => {
      try {
        const actor = await requireActor(context);
        const body = await readBody(context);
        const data = await tickets.complete(
          actor,
          context.req.param('id'),
          typeof body.resolution === 'string' ? body.resolution : '',
        );
        return context.json({ data, meta: meta(actor) });
      } catch (error) {
        return respondError(context, error);
      }
    });

    const mounted = new Hono();
    mounted.route('/tickets', router);
    return mounted;
  },
);

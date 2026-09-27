import type { Application } from '@nocobase/app-server/application';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication/server';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import {
  VisitorError,
  visitorServiceToken,
  type CreateVisitorInput,
  type VisitorListFilter,
  type VisitorService,
  type VisitorStatus,
} from '../providers/visitor-service.js';

/**
 * The router's dependencies, kept narrow so it can be mounted in a test
 * without a whole application.
 */
export interface VisitorRouteDependencies {
  readonly auth: Pick<Auth, 'required'>;
  readonly visitors: VisitorService;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseId(value: string): number | undefined {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function parseStatus(value: string | undefined): VisitorStatus | undefined {
  return value === 'onSite' || value === 'left' ? value : undefined;
}

async function readJsonBody(
  context: Context,
): Promise<Record<string, unknown>> {
  return context.req.json<Record<string, unknown>>().catch(() => ({}));
}

/** Maps a domain failure to its status; anything else keeps travelling to the framework. */
function visitorErrorResponse(context: Context, error: unknown): Response {
  if (error instanceof VisitorError) {
    switch (error.code) {
      case 'VISITOR_NOT_FOUND':
        return context.json({ code: error.code }, 404);
      case 'ALREADY_DEPARTED':
        return context.json({ code: error.code }, 409);
      case 'DEPARTED_BEFORE_ARRIVED':
        return context.json({ code: error.code }, 400);
      case 'VALIDATION_ERROR':
        return context.json({ code: error.code, errors: error.details }, 400);
    }
  }
  throw error;
}

/**
 * The visitor register endpoints, relative to their mount point. Every path is
 * behind the session; the sub-router is mounted only at `/visitors`, so its
 * `*` middleware reaches nothing else.
 */
export function createVisitorRoutes(
  dependencies: VisitorRouteDependencies,
): Hono {
  const routes = new Hono();
  routes.use('*', dependencies.auth.required());

  // Registered before `/:id` so the static segment is not read as an id.
  routes.get('/employee-names', async (context) =>
    context.json({ data: await dependencies.visitors.listEmployeeNames() }),
  );

  routes.get('/', async (context) => {
    const filter: VisitorListFilter = {
      from: context.req.query('from') || undefined,
      to: context.req.query('to') || undefined,
      employeeName: context.req.query('employeeName') || undefined,
      status: parseStatus(context.req.query('status')),
      search: context.req.query('search') || undefined,
    };
    return context.json({ data: await dependencies.visitors.list(filter) });
  });

  routes.post('/', async (context) => {
    const body = await readJsonBody(context);
    const input: CreateVisitorInput = {
      name: readString(body.name),
      phone: readString(body.phone),
      reason: readString(body.reason),
      employeeName: readString(body.employeeName),
      arrivedAt: readString(body.arrivedAt),
    };
    try {
      const visitor = await dependencies.visitors.create(input);
      return context.json({ data: visitor }, 201);
    } catch (error: unknown) {
      return visitorErrorResponse(context, error);
    }
  });

  routes.get('/:id', async (context) => {
    const id = parseId(context.req.param('id'));
    if (id === undefined) {
      return context.json({ code: 'VISITOR_NOT_FOUND' }, 404);
    }
    const visitor = await dependencies.visitors.getById(id);
    return visitor
      ? context.json({ data: visitor })
      : context.json({ code: 'VISITOR_NOT_FOUND' }, 404);
  });

  routes.patch('/:id/checkout', async (context) => {
    const id = parseId(context.req.param('id'));
    if (id === undefined) {
      return context.json({ code: 'VISITOR_NOT_FOUND' }, 404);
    }
    const body = await readJsonBody(context);
    try {
      const visitor = await dependencies.visitors.checkout(
        id,
        readString(body.departedAt),
      );
      return context.json({ data: visitor });
    } catch (error: unknown) {
      return visitorErrorResponse(context, error);
    }
  });

  return routes;
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    router.route(
      '/visitors',
      createVisitorRoutes({
        auth: app.container.resolve(authenticationToken),
        visitors: app.container.resolve(visitorServiceToken),
      }),
    );
    return router;
  },
);

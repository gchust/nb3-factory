import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { Hono, type Context } from 'hono';

import {
  QualityError,
  qualityServiceToken,
  type BatchFilter,
  type NonconformanceFilter,
  type QualityActor,
  type QualityService,
  type TaskFilter,
} from '../providers/quality.js';

/**
 * Quality inspection API. Every path is authenticated here; role and record
 * ownership are enforced by the service, which is the single source of truth
 * for the business rules (assigned inspector, assigned production lead,
 * supervisor-only review).
 */
export const qualityApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const quality = app.container.resolve(qualityServiceToken);

    const routes = new Hono<AuthEnv>();
    routes.use('*', auth.required());

    routes.get('/session', (context) =>
      respond(context, async () =>
        quality.session(await actorOf(quality, context)),
      ),
    );

    routes.get('/products', (context) =>
      respond(context, () => quality.listProducts()),
    );
    routes.post('/products', (context) =>
      respond(context, async () =>
        quality.createProduct(
          await actorOf(quality, context),
          await body(context),
        ),
      ),
    );

    routes.get('/batches', (context) =>
      respond(context, () => quality.listBatches(batchFilter(context))),
    );
    routes.post('/batches', (context) =>
      respond(context, async () =>
        quality.createBatch(
          await actorOf(quality, context),
          await body(context),
        ),
      ),
    );

    routes.get('/tasks', (context) =>
      respond(context, async () =>
        quality.listTasks(await actorOf(quality, context), taskFilter(context)),
      ),
    );
    routes.post('/tasks', (context) =>
      respond(context, async () =>
        quality.createTask(
          await actorOf(quality, context),
          await body(context),
        ),
      ),
    );
    routes.get('/tasks/:id', (context) =>
      respond(context, async () =>
        quality.getTask(
          await actorOf(quality, context),
          context.req.param('id'),
        ),
      ),
    );
    routes.patch('/tasks/:id/items/:itemId', (context) =>
      respond(context, async () =>
        quality.recordItem(
          await actorOf(quality, context),
          context.req.param('id'),
          context.req.param('itemId'),
          await body(context),
        ),
      ),
    );
    routes.post('/tasks/:id/submit', (context) =>
      respond(context, async () =>
        quality.submitTask(
          await actorOf(quality, context),
          context.req.param('id'),
        ),
      ),
    );

    routes.get('/nonconformances', (context) =>
      respond(context, async () =>
        quality.listNonconformances(
          await actorOf(quality, context),
          nonconformanceFilter(context),
        ),
      ),
    );
    routes.get('/nonconformances/:id', (context) =>
      respond(context, async () =>
        quality.getNonconformance(
          await actorOf(quality, context),
          context.req.param('id'),
        ),
      ),
    );
    routes.patch('/nonconformances/:id', (context) =>
      respond(context, async () =>
        quality.updateNonconformance(
          await actorOf(quality, context),
          context.req.param('id'),
          await body(context),
        ),
      ),
    );
    routes.post('/nonconformances/:id/review', (context) =>
      respond(context, async () =>
        quality.reviewNonconformance(
          await actorOf(quality, context),
          context.req.param('id'),
          await body(context),
        ),
      ),
    );

    routes.get('/stats/pass-rate', (context) =>
      respond(context, async () =>
        quality.passRate(await actorOf(quality, context)),
      ),
    );

    routes.get('/assignable-users', (context) =>
      respond(context, async () =>
        quality.assignableUsers(await actorOf(quality, context)),
      ),
    );

    router.route('/quality', routes);
    return router;
  });

async function actorOf(
  quality: QualityService,
  context: Context<AuthEnv>,
): Promise<QualityActor> {
  const auth = context.get('auth');
  if (!auth) {
    throw new QualityError('UNAUTHORIZED', 'Authentication required.', 401);
  }
  const { user } = auth;
  return quality.resolveActor(user.id, user.name || user.email || user.id);
}

type RouteResult = Promise<unknown>;

async function respond(
  context: Context,
  action: () => RouteResult,
): Promise<Response> {
  try {
    return context.json({ data: await action() });
  } catch (error: unknown) {
    if (error instanceof QualityError) {
      return context.json(
        { code: error.code, message: error.message },
        error.status as 400 | 401 | 403 | 404 | 409,
      );
    }
    throw error;
  }
}

async function body(context: Context): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await context.req.json();
  } catch {
    throw new QualityError(
      'VALIDATION',
      'The request body must be valid JSON.',
      400,
    );
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new QualityError(
      'VALIDATION',
      'The request body must be a JSON object.',
      400,
    );
  }
  return value as Record<string, unknown>;
}

function queryValue(context: Context, name: string): string | undefined {
  const value = context.req.query(name);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function batchFilter(context: Context): BatchFilter {
  return {
    search: queryValue(context, 'search'),
    productId: queryValue(context, 'productId'),
    status: queryValue(context, 'status'),
  };
}

function taskFilter(context: Context): TaskFilter {
  return {
    search: queryValue(context, 'search'),
    status: queryValue(context, 'status'),
    result: queryValue(context, 'result'),
    productId: queryValue(context, 'productId'),
    submittedOnly: queryValue(context, 'submittedOnly') === 'true',
  };
}

function nonconformanceFilter(context: Context): NonconformanceFilter {
  return {
    search: queryValue(context, 'search'),
    status: queryValue(context, 'status'),
  };
}

export default qualityApiRoutes;

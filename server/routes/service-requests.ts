import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorizationService,
  type AuthorizationEnv,
  type AuthorizationScope,
} from '@nocobase/app-plugin-authorization';
import { getRequestLocale } from '@nocobase/i18n/server';
import type { AppI18nConfig } from '@nocobase/app-server/i18n';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { Hono } from 'hono';
import {
  SERVICE_REQUEST_COLLECTION,
  ServiceRequestError,
  serviceRequestServiceToken,
  type ServiceRequestService,
} from '../providers/service-request.js';

function readId(value: string | undefined): number {
  return Number(value);
}

/**
 * The caller's resolved database Policy for the request table. Every handler
 * resolves one and binds it to the query or write it performs, so row scope and
 * field allowlists are enforced by the Repository rather than re-implemented
 * here. A `false` node is a denial for that operation.
 */
async function requestPolicy(
  authorization: AppAuthorizationService,
  context: { get: (key: 'authz') => AuthorizationScope },
) {
  return authorization.db.policyFor(
    SERVICE_REQUEST_COLLECTION,
    context.get('authz'),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function forbidden(message: string) {
  const error = new AuthorizationDeniedError({
    effect: 'deny',
    reasons: [{ code: 'FORBIDDEN', message }],
  });
  return error;
}

/**
 * The service-request API. Every handler is behind a session and behind an
 * explicit `serviceRequests` permission check; the accept endpoint is what runs
 * the acceptance workflow, so a denied caller never reaches the workflow.
 */
export function createServiceRequestRoutes(
  service: ServiceRequestService,
  authorization: AppAuthorizationService,
  auth: Auth,
  defaultLocale: string,
): Hono<AuthorizationEnv> {
  const routes = new Hono<AuthorizationEnv>();
  routes.use('*', auth.required(), authorization.middleware());
  routes.onError((error, context) => {
    if (error instanceof AuthorizationDeniedError) {
      return context.json({ code: 'FORBIDDEN', message: error.message }, 403);
    }
    if (error instanceof ServiceRequestError) {
      return context.json(
        { code: error.code, message: error.message },
        error.status,
      );
    }
    if (error instanceof TypeError) {
      return context.json(
        { code: 'INVALID_INPUT', message: error.message },
        400,
      );
    }
    throw error;
  });

  routes.get('/', async (context) => {
    const policy = await requestPolicy(authorization, context);
    if (policy.read === false) {
      throw forbidden('Reading service requests is not allowed.');
    }
    return context.json({ data: await service.list(policy) });
  });

  routes.post('/', async (context) => {
    const policy = await requestPolicy(authorization, context);
    if (policy.create === false) {
      throw forbidden('Creating a service request is not allowed.');
    }
    const body: unknown = await context.req.json();
    if (!isRecord(body)) {
      throw new TypeError('A service request body must be an object.');
    }
    const title = Reflect.get(body, 'title');
    const urgent = Reflect.get(body, 'urgent');
    const assigneeId = Reflect.get(body, 'assigneeId');
    if (typeof title !== 'string') {
      throw new TypeError('title must be a string.');
    }
    if (urgent !== undefined && typeof urgent !== 'boolean') {
      throw new TypeError('urgent must be a boolean.');
    }
    if (
      assigneeId !== undefined &&
      assigneeId !== null &&
      typeof assigneeId !== 'string'
    ) {
      throw new TypeError('assigneeId must be a string or null.');
    }
    const created = await service.create(policy, {
      title,
      urgent: urgent === true,
      assigneeId: typeof assigneeId === 'string' ? assigneeId : null,
    });
    return context.json({ data: created }, 201);
  });

  routes.get('/assignees', async (context) => {
    // Registered before `/:id` so the static segment wins. The picker needs
    // only the request read grant, not the Users plugin's administrative API.
    const policy = await requestPolicy(authorization, context);
    if (policy.read === false) {
      throw forbidden('Reading service requests is not allowed.');
    }
    return context.json({ data: await service.listAssignees() });
  });

  routes.get('/:id', async (context) => {
    const policy = await requestPolicy(authorization, context);
    if (policy.read === false) {
      throw forbidden('Reading service requests is not allowed.');
    }
    const id = readId(context.req.param('id'));
    const record = await service.get(policy, id);
    if (!record) {
      throw new ServiceRequestError(
        'SERVICE_REQUEST_NOT_FOUND',
        `Service request ${id} was not found.`,
        404,
      );
    }
    return context.json({ data: record });
  });

  routes.post('/:id/accept', async (context) => {
    // Accepting is a business action on the Collection, gated by the caller's
    // `update` grant. The state transition itself runs in the workflow with
    // elevated access, not through the caller's Repository policy.
    const policy = await requestPolicy(authorization, context);
    if (policy.update === false) {
      throw forbidden('Accepting a service request is not allowed.');
    }
    const id = readId(context.req.param('id'));
    const locale = getRequestLocale(context) ?? defaultLocale;
    const result = await service.accept(id, { locale });
    // Only the run id: the workflow runs asynchronously, so a record read here
    // would still show `pending`. The caller reloads the record it needs.
    return context.json({ data: result }, 202);
  });

  return routes;
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const service = app.container.resolve(serviceRequestServiceToken);
    const defaultLocale =
      app.config.get<AppI18nConfig>('i18n')?.defaultLocale ?? 'en-US';

    router.route(
      '/service-requests',
      createServiceRequestRoutes(service, authorization, auth, defaultLocale),
    );

    return router;
  },
);

export default apiRoutes;

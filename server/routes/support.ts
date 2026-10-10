import type { Application } from '@nocobase/app-server/application';
import {
  authenticationToken,
  type Auth,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { loggingToken } from '@nocobase/app-server/logging';
import { ApiError, apiErrorHandler } from '@nocobase/app-server/router';
import type { AuthorizationEnv } from '@nocobase/authorization/core';
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type Context } from 'hono';

import type {
  AppDriveManager,
  RequestServiceContext,
  ServiceLogger,
} from '../services/context.js';
import { ServiceError } from '../services/errors.js';
import {
  assistantStatusServiceToken,
  manualIndexServiceToken,
  type AssistantStatusService,
  type ManualIndexService,
} from '../services/tokens.js';

/**
 * The Hono environment of every service router.
 *
 * `auth` is read from the session middleware and `authz` from the authorization
 * middleware. The two variables are intersected into one `Variables` record
 * rather than inherited through interface extension, because each plugin
 * declares its own and TypeScript will not merge named properties across
 * `extends`.
 */
export type ServiceEnv = Omit<AuthEnv & AuthorizationEnv, 'Variables'> & {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

export type ServiceRouter = Hono<ServiceEnv>;

/** The container services a service route needs, resolved once per request. */
export interface ServiceHttpServices {
  readonly auth: Auth;
  readonly authorization: AppAuthorization;
  readonly database: RequestServiceContext['database'];
  readonly notification?: RequestServiceContext['notification'];
  readonly drive?: AppDriveManager;
  readonly logger?: ServiceLogger;
  readonly manualIndex?: ManualIndexService;
  readonly assistant?: AssistantStatusService;
  readonly workflow?: RequestServiceContext['workflow'];
}

/** Resolves the services the service routes read, tolerating an optional plugin. */
export function resolveServices(app: Application): ServiceHttpServices {
  const container = app.container;
  return {
    auth: container.resolve(authenticationToken),
    authorization: container.resolve(authorizationToken),
    database: container.resolve(databaseManagerToken),
    ...(container.has(notificationServiceToken)
      ? { notification: container.resolve(notificationServiceToken) }
      : {}),
    ...(container.has(driveManagerToken)
      ? { drive: container.resolve(driveManagerToken) }
      : {}),
    ...(container.has(loggingToken)
      ? {
          logger: container
            .resolve(loggingToken)
            .getLogger()
            .child({ module: 'service-api' }),
        }
      : {}),
    ...(container.has(manualIndexServiceToken)
      ? { manualIndex: container.resolve(manualIndexServiceToken) }
      : {}),
    ...(container.has(assistantStatusServiceToken)
      ? { assistant: container.resolve(assistantStatusServiceToken) }
      : {}),
    ...(container.has(workflowServiceToken)
      ? { workflow: container.resolve(workflowServiceToken) }
      : {}),
  };
}

/** A router that answers the service domain's errors in the standard error body. */
export function createServiceRouter(): ServiceRouter {
  const router = new Hono<ServiceEnv>();
  router.onError(serviceErrorHandler);
  return router;
}

/**
 * Answers a `ServiceError` with the canonical error body and lets everything
 * else fall through to the framework's handler.
 *
 * `ServiceError` carries the canonical status name and a domain-specific
 * `reason`; translating it into an `ApiError` here is what makes a missing order
 * answer `404 ORDER_NOT_FOUND` instead of an opaque 500.
 */
export function serviceErrorHandler(
  error: unknown,
  context: Context,
): Response {
  if (error instanceof ServiceError) {
    return apiErrorHandler(
      new ApiError({
        status: error.status,
        reason: error.reason,
        domain: 'service',
        message: error.message,
        cause: error,
      }),
      context,
    );
  }
  return apiErrorHandler(error, context);
}

/** The signed-in user's id, or a `401` when the middleware found no session. */
export function actorId(context: Context<ServiceEnv>): string {
  const auth = context.get('auth');
  const id = auth?.user?.id;
  if (!id) {
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      reason: 'SESSION_REQUIRED',
      domain: 'service',
      message: 'This endpoint requires a signed-in session.',
    });
  }
  return String(id);
}

/** The request's authorization context, plus the identity and data services it runs with. */
export function requestContext(
  services: ServiceHttpServices,
  context: Context<ServiceEnv>,
): RequestServiceContext {
  return {
    authz: context.get('authz'),
    actorId: actorId(context),
    policies: {},
    database: services.database,
    ...(services.notification ? { notification: services.notification } : {}),
    ...(services.drive ? { drive: services.drive } : {}),
    ...(services.logger ? { logger: services.logger } : {}),
    ...(services.workflow ? { workflow: services.workflow } : {}),
  };
}

/** The `{ data }` envelope every successful read answers with. */
export function data(context: Context<ServiceEnv>, value: unknown): Response {
  return context.json({ data: value });
}

/** The paged `{ data, meta }` envelope a list endpoint answers with. */
export function page(
  context: Context<ServiceEnv>,
  result: {
    rows: readonly unknown[];
    total: number;
    limit: number;
    offset: number;
  },
): Response {
  return context.json({
    data: result.rows,
    meta: { total: result.total, limit: result.limit, offset: result.offset },
  });
}

/** The client's `Page<T>` shape, so a list route can pass through what a service returned. */
export interface ServicePage<T> {
  readonly rows: T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

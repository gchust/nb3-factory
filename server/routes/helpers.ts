import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AuthSession } from '@nocobase/app-plugin-authentication/server';
import {
  ServiceError,
  forbidden,
  type ServiceActor,
} from '../services/contracts.js';
import type { AccessService } from '../services/access-service.js';

/**
 * Reads the signed-in user from the session the authentication middleware
 * resolved — cookie or API key, the route neither knows nor cares.
 */
export function sessionUserId(context: Context): string | undefined {
  const session = context.get('auth') as AuthSession | undefined;
  const id = session?.user?.id;
  return id === undefined || id === null ? undefined : String(id);
}

/** The actor a service call must be made as. */
export async function requireActor(
  context: Context,
  access: AccessService,
): Promise<ServiceActor> {
  const userId = sessionUserId(context);
  if (!userId) {
    throw forbidden('Sign in to use the service desk.');
  }
  return access.resolveActor(userId);
}

export function jsonError(context: Context, error: unknown): Response {
  if (error instanceof ServiceError) {
    return context.json(
      { code: error.code, message: error.message },
      error.status as ContentfulStatusCode,
    );
  }
  throw error;
}

/**
 * Wraps a handler so every `ServiceError` becomes the HTTP answer its status
 * describes instead of a 500.
 */
export function route(
  handler: (context: Context) => Promise<Response> | Response,
): (context: Context) => Promise<Response> {
  return async (context) => {
    try {
      return await handler(context);
    } catch (error) {
      return jsonError(context, error);
    }
  };
}

export function toNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true' || value === '1' || value === 1) {
    return true;
  }
  if (value === 'false' || value === '0' || value === 0) {
    return false;
  }
  return undefined;
}

/**
 * A JSON request body as a plain object. `unknown` fields rather than `any`, so
 * every read below has to be narrowed before it becomes a domain value.
 */
export async function readJsonBody(
  context: Context,
): Promise<Record<string, unknown>> {
  const body = await context.req.json<unknown>();
  return typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

/** A JSON request body as a plain object, or an empty one when none was sent. */
export async function readOptionalBody(
  context: Context,
): Promise<Record<string, unknown>> {
  try {
    const body = await context.req.json<unknown>();
    return typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** A string field: only strings, numbers and booleans become text; anything else is absent. */
export function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

/** A required string field, empty when absent. */
export function asText(value: unknown): string {
  return asString(value) ?? '';
}

/**
 * API keys are automation credentials for the device platform, not a human
 * approver. They may submit a repair request and read their own tickets, but
 * they may never accept, process, return or close one. The check is on the
 * presented credential, so it holds even for an administrator's key.
 */
export function forbidApiKeyActor(context: Context): void {
  if (context.req.header('x-api-key')) {
    throw forbidden(
      'An API key may not perform ticket processing or decision actions.',
    );
  }
}

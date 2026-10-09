import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  describeRoute,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { ApiKeyService } from '@nocobase/app-plugin-api-keys/server';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireActor, requireSupervisor } from './helpers.js';

const tags = ['Service integration credentials'];

const idParam = z.object({ id: z.string().min(1) });

const keyShape = z.object({
  id: z.string(),
  name: z.string().nullable(),
  start: z.string().nullable(),
  enabled: z.boolean(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  ownerId: z.string(),
  ownerName: z.string(),
});

/** The permission sets whose keys a supervisor may inspect and revoke. */
const SERVICE_PERMISSION_SETS = [
  'service-integration',
  'service-engineer',
  'service-supervisor',
] as const;

/** The one set that identifies the dedicated external integration account. */
const INTEGRATION_PERMISSION_SET = 'service-integration';

const accountShape = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string().nullable(),
});

const createKeyBody = z.object({
  // The key belongs to the account, not to the supervisor who issues it, so
  // the target is explicit instead of being taken from the caller's session.
  userId: z.string().min(1),
  name: z.string().trim().min(1).max(64),
  // Whole days, matching Better Auth's own 1..365 validation. Converted to
  // seconds below because that is the unit the plugin stores.
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

/**
 * Trusted management of the integration account's API keys.
 *
 * Better Auth's own `/api/auth/api-key/*` endpoints are self-service: they act
 * only on the caller's keys, so a supervisor gets `404 KEY_NOT_FOUND` when
 * trying to revoke a key that belongs to the integration user. The plugin
 * exposes `ApiKeyService` for exactly this case, so the application checks the
 * supervisor permission set itself and then performs the trusted operation.
 */
export function registerIntegrationKeyRoutes(
  app: Application,
  router: Hono,
): void {
  const database = app.container.resolve(databaseManagerToken);

  const subjectIdsForSets = async (
    sets: readonly string[],
  ): Promise<string[]> => {
    const rows = await database
      .query('main')
      .selectFrom('authorization_permission_set_assignments')
      .select('subject_id')
      .where('subject_type', '=', 'user')
      .where('permission_set_key', 'in', [...sets])
      .execute<{ subject_id: string }>();
    return [...new Set(rows.map((row) => row.subject_id))];
  };

  const serviceUserIds = (): Promise<string[]> =>
    subjectIdsForSets(SERVICE_PERMISSION_SETS);

  const integrationUserIds = (): Promise<string[]> =>
    subjectIdsForSets([INTEGRATION_PERMISSION_SET]);

  const apiKeyService = (): ApiKeyService =>
    new ApiKeyService(app.container.resolve(authenticationToken), 'default');

  router.get(
    '/service/integration/api-keys',
    describeRoute({
      tags,
      summary: 'List the API keys held by service accounts',
      operationId: 'serviceIntegrationApiKeysFindMany',
      responses: {
        200: dataResponse(z.array(keyShape)),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      const ownerIds = await serviceUserIds();
      if (ownerIds.length === 0) {
        return context.json({ data: [] });
      }
      // Read-only: the `apikey` table stores only a hash in `key`, and Better
      // Auth exposes no server-side list, so the owner is resolved by joining
      // the user table for a readable name.
      const keys = await database
        .query('main')
        .selectFrom('apikey')
        .select([
          'id',
          'name',
          'start',
          'enabled',
          'expiresAt',
          'createdAt',
          'referenceId',
        ])
        .where('configId', '=', 'default')
        .where('referenceId', 'in', ownerIds)
        .orderBy('createdAt', 'desc')
        .execute<{
          id: string;
          name: string | null;
          start: string | null;
          enabled: boolean | number;
          expiresAt: string | null;
          createdAt: string;
          referenceId: string;
        }>();
      const owners = await database
        .query('main')
        .selectFrom('user')
        .select(['id', 'name'])
        .where('id', 'in', ownerIds)
        .execute<{ id: string; name: string | null }>();
      const nameById = new Map(
        owners.map((owner) => [String(owner.id), owner.name]),
      );
      return context.json({
        data: keys.map((key) => ({
          id: key.id,
          name: key.name,
          start: key.start,
          enabled: Boolean(key.enabled),
          expiresAt: key.expiresAt,
          createdAt: key.createdAt,
          ownerId: String(key.referenceId),
          ownerName:
            nameById.get(String(key.referenceId)) ?? String(key.referenceId),
        })),
      });
    },
  );

  router.get(
    '/service/integration/accounts',
    describeRoute({
      tags,
      summary: 'List the dedicated external integration accounts',
      operationId: 'serviceIntegrationAccountsFindMany',
      responses: {
        200: dataResponse(z.array(accountShape)),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        500: apiErrorResponses['500'],
      },
    }),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      const ids = await integrationUserIds();
      if (ids.length === 0) {
        return context.json({ data: [] });
      }
      const accounts = await database
        .query('main')
        .selectFrom('user')
        .select(['id', 'name', 'username'])
        .where('id', 'in', ids)
        .execute<{
          id: string;
          name: string | null;
          username: string | null;
        }>();
      return context.json({
        data: accounts.map((account) => ({
          id: String(account.id),
          name: account.name ?? String(account.id),
          username: account.username,
        })),
      });
    },
  );

  router.post(
    '/service/integration/api-keys',
    describeRoute({
      tags,
      summary: 'Issue an API key for an external integration account',
      description:
        'The secret is returned once and never again. The key belongs to the selected integration account, so it carries that account’s permission set rather than the supervisor’s.',
      operationId: 'serviceIntegrationApiKeyCreate',
      responses: {
        201: dataResponse(keyShape.extend({ secret: z.string() })),
        400: apiErrorResponse(400),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        404: apiErrorResponse(404),
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('json', createKeyBody),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      const body = context.req.valid('json');
      const integrationIds = await integrationUserIds();
      if (!integrationIds.includes(body.userId)) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'SERVICE_INTEGRATION_ACCOUNT_NOT_FOUND',
          domain: 'service',
          message:
            'The selected account is not a device-platform integration account.',
        });
      }
      const owner = await database
        .query('main')
        .selectFrom('user')
        .select(['name', 'username'])
        .where('id', '=', body.userId)
        .executeTakeFirst<{ name: string | null; username: string | null }>();
      const { key, secret } = await apiKeyService().create({
        userId: body.userId,
        name: body.name,
        expiresIn: body.expiresInDays ? body.expiresInDays * 86_400 : null,
      });
      // The plugin types these as `Date`, but the row it returns may already be
      // serialized, so both shapes are normalized to the ISO string the API
      // document declares.
      const iso = (value: Date | string | null): string | null =>
        value == null ? null : new Date(value).toISOString();
      return context.json(
        {
          data: {
            id: key.id,
            name: key.name,
            start: key.start,
            enabled: Boolean(key.enabled),
            expiresAt: iso(key.expiresAt),
            createdAt: iso(key.createdAt) ?? new Date().toISOString(),
            ownerId: body.userId,
            ownerName: owner?.name ?? owner?.username ?? String(body.userId),
            secret,
          },
        },
        201,
      );
    },
  );

  router.post(
    '/service/integration/api-keys/:id/revoke',
    describeRoute({
      tags,
      summary: 'Revoke an API key held by a service account',
      operationId: 'serviceIntegrationApiKeysRevoke',
      responses: {
        200: dataResponse(z.object({ id: z.string(), revoked: z.boolean() })),
        401: apiErrorResponses['401'],
        403: apiErrorResponses['403'],
        404: apiErrorResponse(404),
        500: apiErrorResponses['500'],
      },
    }),
    apiValidator('param', idParam),
    async (context) => {
      const actor = await requireActor(app, context);
      await requireSupervisor(app, actor.id);
      const id = context.req.valid('param').id;
      const service = apiKeyService();
      const key = await service.get(id);
      if (!key) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'SERVICE_API_KEY_NOT_FOUND',
          domain: 'service',
          message: `API key ${id} was not found.`,
        });
      }
      const ownerIds = await serviceUserIds();
      if (!ownerIds.includes(key.referenceId)) {
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'SERVICE_API_KEY_NOT_SERVICE_ACCOUNT',
          domain: 'service',
          message: 'Only keys held by service accounts may be managed here.',
        });
      }
      await service.remove(id);
      return context.json({ data: { id, revoked: true } });
    },
  );
}

import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server/tokens';
import { Hono, type Context, type MiddlewareHandler } from 'hono';

import {
  ASSIGNABLE_INSPECTION_ROLES,
  INSPECTION_ROLES,
  ensureInspectionRoles,
  resolveUserRole,
  type InspectionRole,
  type ResolvedRole,
} from '../providers/inspection-roles.js';
import { inspectionServiceToken } from '../providers/index.js';
import type { RecordRow } from '../providers/inspection-service.js';
import { INSPECTION_PHOTOS_ACCESS_PATH } from './inspection-files.js';

const DEVICE_STATUSES = new Set(['in_use', 'stopped', 'repair']);
const PLAN_CYCLES = new Set(['daily', 'weekly', 'monthly']);
const PLAN_STATUSES = new Set(['active', 'ended']);
const RESULTS = new Set(['normal', 'abnormal']);

export const inspectionApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono<AuthEnv>();
    const secured = new Hono<AuthEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const service = app.container.resolve(inspectionServiceToken);
    const basePath = (app.publicBasePath ?? '').replace(/\/$/, '');

    // Public self-registration. It only ever grants one of the three
    // inspection roles, never the administrator set, and it is the only route
    // on this contribution that does not require a session.
    router.post('/inspection-registration', async (context) => {
      const body = await readJsonObject(context);
      if (!body) return context.json({ code: 'INVALID_BODY' }, 400);

      const name = readString(body.name);
      const username = readString(body.username);
      const email = readString(body.email);
      const password = readString(body.password);
      const role = readString(body.role);
      if (!name || !username || !email || !password) {
        return context.json({ code: 'MISSING_FIELDS' }, 400);
      }
      // Match the authentication username rule so an account is never created
      // that the sign-in endpoint will then refuse.
      if (username.length < 3 || username.length > 30) {
        return context.json({ code: 'INVALID_USERNAME' }, 400);
      }
      if (!isAssignableRole(role)) {
        return context.json({ code: 'INVALID_ROLE' }, 400);
      }

      await ensureInspectionRoles(authorization);
      const users = app.container.resolve(userManagementServiceToken);
      try {
        const user = await users.create({
          name,
          username,
          email,
          password,
          roleScopes: { app: [INSPECTION_ROLES[role]] },
        });
        return context.json({ data: { id: user.id } }, 201);
      } catch (error) {
        const code = errorCode(error);
        if (
          code === 'USER_EMAIL_CONFLICT' ||
          code === 'USER_USERNAME_CONFLICT' ||
          code === 'USER_IDENTITY_CONFLICT'
        ) {
          return context.json({ code: 'USER_EXISTS' }, 409);
        }
        if (code === 'PASSWORD_TOO_SHORT' || code === 'PASSWORD_TOO_LONG') {
          return context.json({ code: 'INVALID_PASSWORD' }, 400);
        }
        if (code === 'INVALID_ROLE_SCOPE_VALUE') {
          return context.json({ code: 'INVALID_ROLE' }, 400);
        }
        return context.json({ code: 'REGISTRATION_FAILED' }, 500);
      }
    });

    secured.use('*', auth.required());

    secured.get('/me', async (context) => {
      const session = requireSession(context);
      if (!session) return context.json({ code: 'UNAUTHORIZED' }, 401);
      await safeEnsureRoles(authorization);
      const role = await resolveUserRole(authorization, session.user.id);
      return context.json({
        data: {
          id: session.user.id,
          name: session.user.name,
          username: (session.user as { username?: string }).username ?? null,
          email: session.user.email,
          role,
        },
      });
    });

    // --- devices ---------------------------------------------------------
    secured.get('/devices', async (context) =>
      context.json({ data: await service.listDevices() }),
    );

    secured.post(
      '/devices',
      requireRole(authorization, ['admin']),
      async (context) => {
        const body = await readJsonObject(context);
        const input = parseDevice(body);
        if (!input) return context.json({ code: 'INVALID_DEVICE' }, 400);
        const duplicate = (await service.listDevices()).some(
          (device) => device.code === input.code,
        );
        if (duplicate) return context.json({ code: 'DEVICE_CODE_EXISTS' }, 409);
        const id = await service.createDevice(input);
        return context.json({ data: { id } }, 201);
      },
    );

    secured.patch(
      '/devices/:id',
      requireRole(authorization, ['admin']),
      async (context) => {
        const id = readId(context);
        if (id === undefined) return context.json({ code: 'INVALID_ID' }, 400);
        const body = await readJsonObject(context);
        const input = parseDevice(body);
        if (!input) return context.json({ code: 'INVALID_DEVICE' }, 400);
        const updated = await service.updateDevice(id, input);
        if (updated === 0) return context.json({ code: 'NOT_FOUND' }, 404);
        return context.json({ data: { id } });
      },
    );

    // --- plans -----------------------------------------------------------
    secured.get('/plans', async (context) =>
      context.json({ data: await service.listPlans() }),
    );

    secured.post(
      '/plans',
      requireRole(authorization, ['admin']),
      async (context) => {
        const body = await readJsonObject(context);
        const input = parsePlan(body);
        if (!input) return context.json({ code: 'INVALID_PLAN' }, 400);
        const id = await service.createPlan(input);
        return context.json({ data: { id } }, 201);
      },
    );

    secured.patch(
      '/plans/:id',
      requireRole(authorization, ['admin']),
      async (context) => {
        const id = readId(context);
        if (id === undefined) return context.json({ code: 'INVALID_ID' }, 400);
        const body = await readJsonObject(context);
        const input = parsePlan(body);
        if (!input) return context.json({ code: 'INVALID_PLAN' }, 400);
        const updated = await service.updatePlan(id, input);
        if (updated === 0) return context.json({ code: 'NOT_FOUND' }, 404);
        return context.json({ data: { id } });
      },
    );

    // --- records ---------------------------------------------------------
    secured.get('/records', async (context) => {
      const session = requireSession(context);
      if (!session) return context.json({ code: 'UNAUTHORIZED' }, 401);
      const role = await resolveUserRole(authorization, session.user.id);
      const query = context.req.query();
      const filter = {
        deviceId: readOptionalId(query.deviceId),
        result: RESULTS.has(query.result ?? '') ? query.result : undefined,
        from: readOptionalDate(query.from),
        to: readOptionalDate(query.to),
        ...(role === 'inspector' ? { createdById: session.user.id } : {}),
      };
      const records = await service.listRecords(filter);
      return context.json({ data: records });
    });

    secured.post(
      '/records',
      requireRole(authorization, ['admin', 'teamLead', 'inspector']),
      async (context) => {
        const session = requireSession(context);
        if (!session) return context.json({ code: 'UNAUTHORIZED' }, 401);
        const body = await readJsonObject(context);
        if (!body) return context.json({ code: 'INVALID_BODY' }, 400);

        const deviceId = readPositiveInt(body.deviceId);
        const result = readString(body.result);
        if (deviceId === undefined) {
          return context.json({ code: 'INVALID_DEVICE' }, 400);
        }
        if (!isResult(result)) {
          return context.json({ code: 'INVALID_RESULT' }, 400);
        }
        const photoIds = parsePhotoIds(body.photoIds);
        if (photoIds.length === 0) {
          return context.json({ code: 'PHOTOS_REQUIRED' }, 400);
        }
        const device = await service.findDevice(deviceId);
        if (!device) return context.json({ code: 'INVALID_DEVICE' }, 400);
        const existing = new Set(await service.existingFileIds(photoIds));
        if (!photoIds.every((id) => existing.has(id))) {
          return context.json({ code: 'PHOTO_NOT_FOUND' }, 400);
        }

        const planId = readOptionalId(body.planId);
        const plan =
          planId === undefined ? undefined : await service.findPlan(planId);
        if (planId !== undefined && !plan) {
          return context.json({ code: 'INVALID_PLAN' }, 400);
        }
        const description = readString(body.description);

        const id = await service.createRecord({
          deviceId,
          planId: planId ?? null,
          result,
          description: description || null,
          team: plan?.team ?? null,
          createdById: session.user.id,
          createdByName: session.user.name ?? null,
          photoIds,
        });
        return context.json({ data: { id } }, 201);
      },
    );

    secured.get('/records/:id', async (context) => {
      const session = requireSession(context);
      if (!session) return context.json({ code: 'UNAUTHORIZED' }, 401);
      const id = readId(context);
      if (id === undefined) return context.json({ code: 'INVALID_ID' }, 400);
      const role = await resolveUserRole(authorization, session.user.id);
      const record = await service.getRecord(id);
      if (!record || !canRead(role, session.user.id, record)) {
        return context.json({ code: 'NOT_FOUND' }, 404);
      }
      const photos = await service.listPhotos([id]);
      return context.json({
        data: {
          ...record,
          photos: photos.map((photo) => ({
            ...photo,
            contentUrl: photoContentUrl(basePath, photo.fileId, photo.ext),
          })),
        },
      });
    });

    secured.patch(
      '/records/:id',
      requireRole(authorization, ['admin', 'teamLead']),
      async (context) => {
        const id = readId(context);
        if (id === undefined) return context.json({ code: 'INVALID_ID' }, 400);
        const body = await readJsonObject(context);
        if (!body) return context.json({ code: 'INVALID_BODY' }, 400);
        const patch: { result?: string; description?: string | null } = {};
        if (body.result !== undefined) {
          const result = readString(body.result);
          if (!isResult(result)) {
            return context.json({ code: 'INVALID_RESULT' }, 400);
          }
          patch.result = result;
        }
        if (body.description !== undefined) {
          patch.description = readString(body.description) || null;
        }
        if (Object.keys(patch).length === 0) {
          return context.json({ code: 'INVALID_BODY' }, 400);
        }
        const record = await service.getRecord(id);
        if (!record) return context.json({ code: 'NOT_FOUND' }, 404);
        await service.updateRecord(id, patch);
        return context.json({ data: { id } });
      },
    );

    secured.delete(
      '/records/:id/photos/:fileId',
      requireRole(authorization, ['admin', 'teamLead', 'inspector']),
      async (context) => {
        const session = requireSession(context);
        if (!session) return context.json({ code: 'UNAUTHORIZED' }, 401);
        const id = readId(context);
        const fileId = context.req.param('fileId');
        if (id === undefined || !fileId) {
          return context.json({ code: 'INVALID_ID' }, 400);
        }
        const record = await service.getRecord(id);
        if (!record) return context.json({ code: 'NOT_FOUND' }, 404);
        // An inspector may withdraw a photo from their own record; anyone
        // else's photo stays under the team lead's control.
        const role = await resolveUserRole(authorization, session.user.id);
        if (role === 'inspector' && record.createdById !== session.user.id) {
          return context.json({ code: 'FORBIDDEN' }, 403);
        }
        const deleted = await service.deleteRecordPhoto(id, fileId);
        if (!deleted) return context.json({ code: 'NOT_FOUND' }, 404);
        return context.json({ data: { id, fileId } });
      },
    );

    // --- statistics ------------------------------------------------------
    secured.get('/stats', async (context) => {
      const session = requireSession(context);
      if (!session) return context.json({ code: 'UNAUTHORIZED' }, 401);
      const role = await resolveUserRole(authorization, session.user.id);
      const stats = await service.deviceStats(
        role === 'inspector' ? session.user.id : undefined,
      );
      return context.json({ data: stats });
    });

    router.route('/inspection', secured);
    // The framework contribution is typed against the blank environment; the
    // router's AuthEnv only matters to the handlers registered above.
    return router as unknown as Hono;
  });

function photoContentUrl(
  basePath: string,
  fileId: string,
  ext: string,
): string {
  const suffix = ext ? `.${ext}` : '';
  return `${basePath}${INSPECTION_PHOTOS_ACCESS_PATH}/${fileId}${suffix}`;
}

function requireSession(context: Context<AuthEnv>) {
  const session = context.get('auth');
  return session && session.user ? session : undefined;
}

function requireRole(
  authorization: Parameters<typeof resolveUserRole>[0],
  allowed: readonly ResolvedRole[],
): MiddlewareHandler<AuthEnv> {
  return async (context, next) => {
    const session = requireSession(context);
    if (!session) return context.json({ code: 'UNAUTHORIZED' }, 401);
    await ensureInspectionRoles(authorization);
    const role = await resolveUserRole(authorization, session.user.id);
    if (!allowed.includes(role)) {
      return context.json({ code: 'FORBIDDEN' }, 403);
    }
    await next();
  };
}

function canRead(
  role: ResolvedRole,
  userId: string,
  record: RecordRow,
): boolean {
  if (role === 'admin' || role === 'teamLead' || role === 'viewer') return true;
  if (role === 'inspector') return record.createdById === userId;
  return false;
}

async function safeEnsureRoles(
  authorization: Parameters<typeof ensureInspectionRoles>[0],
): Promise<void> {
  try {
    await ensureInspectionRoles(authorization);
  } catch {
    // Role resolution does not depend on the sets existing.
  }
}

async function readJsonObject(
  context: Context<AuthEnv>,
): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await context.req.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return undefined;
    }
    return body as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function parseDevice(body: Record<string, unknown> | undefined) {
  if (!body) return undefined;
  const code = readString(body.code);
  const name = readString(body.name);
  const location = readString(body.location);
  const type = readString(body.type);
  const status = readString(body.status);
  if (!code || !name || !location || !type || !status) return undefined;
  if (!DEVICE_STATUSES.has(status)) return undefined;
  return { code, name, location, type, status };
}

function parsePlan(body: Record<string, unknown> | undefined) {
  if (!body) return undefined;
  const name = readString(body.name);
  const cycle = readString(body.cycle);
  const team = readString(body.team);
  const startDate = readOptionalDate(readString(body.startDate));
  const status = readString(body.status);
  if (!name || !team) return undefined;
  if (!cycle || !PLAN_CYCLES.has(cycle)) return undefined;
  if (!status || !PLAN_STATUSES.has(status)) return undefined;
  if (!startDate) return undefined;
  return { name, cycle, team, startDate, status };
}

function isAssignableRole(value: string | undefined): value is InspectionRole {
  return (
    typeof value === 'string' &&
    (ASSIGNABLE_INSPECTION_ROLES as readonly string[]).includes(value)
  );
}

function isResult(value: unknown): value is string {
  return typeof value === 'string' && RESULTS.has(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readId(context: Context<AuthEnv>): number | undefined {
  return readPositiveInt(context.req.param('id'));
}

function readPositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function readOptionalId(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return readPositiveInt(value);
}

function readOptionalDate(value: unknown): string | undefined {
  const text = readString(value);
  if (!text) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function parsePhotoIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  );
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

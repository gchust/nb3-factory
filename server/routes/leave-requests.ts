import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppApiRouteContribution,
  type AppRootRouteContribution,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import type { FileRecord } from '@nocobase/app-plugin-file/server';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { Hono, type Context } from 'hono';
import { Readable } from 'node:stream';

import {
  EVIDENCE_ACCESS_PATH,
  EVIDENCE_COLLECTION,
  EVIDENCE_DISK,
  LEAVE_REQUEST_TYPES,
  leaveRequestServiceToken,
  LeaveRequestAlreadyProcessedError,
  LeaveRequestInvalidInputError,
  LeaveRequestNotFoundError,
  LeaveEvidenceNotFoundError,
  type LeaveRequestActor,
  type LeaveRequestDetail,
  type LeaveRequestService,
  type LeaveRequestSummary,
  type LeaveRequestType,
} from '../providers/leave-requests.js';

/**
 * Every leave-request endpoint requires a signed-in user. The application has no
 * supervisor-vs-employee split, so authorization is identity-based: any authenticated
 * user may create requests and process pending ones. All writes record who acted.
 */
export const leaveRequestApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app: Application) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(leaveRequestServiceToken);
    const routes = new Hono<AuthEnv>();

    // Scope the auth middleware to this sub-router only; `*` matches the exact
    // prefix path as well as everything below it, and nothing outside it.
    routes.use('*', auth.required());

    routes.get('/', async (c) => {
      const data = await service.list();
      return c.json({ data: Array.from(data, decorateSummary) });
    });

    routes.get('/:id', async (c) => {
      const id = parseId(c);
      if (id === undefined) return invalidInput(c, 'Invalid leave request id.');
      const request = await service.get(id);
      if (!request) return notFound(c);
      return c.json({ data: decorateDetail(app, request) });
    });

    routes.post('/', async (c) => {
      const actor = currentActor(c);
      if (!actor) return c.json({ code: 'UNAUTHENTICATED' }, 401);
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return invalidInput(c, 'Request body must be valid JSON.');
      }
      const parsed = parseCreateBody(body);
      if (!parsed.ok) return invalidInput(c, parsed.error);
      try {
        const created = await service.create(parsed.value, actor);
        return c.json({ data: decorateDetail(app, created) }, 201);
      } catch (error) {
        return mapServiceError(c, error);
      }
    });

    routes.post('/:id/approve', async (c) =>
      processApproval(c, app, service, 'approve'),
    );

    routes.post('/:id/reject', async (c) =>
      processApproval(c, app, service, 'reject'),
    );

    routes.post('/:id/evidence/upload', async (c) => {
      const actor = currentActor(c);
      if (!actor) return c.json({ code: 'UNAUTHENTICATED' }, 401);
      const id = parseId(c);
      if (id === undefined) return invalidInput(c, 'Invalid leave request id.');
      const contentType = c.req.header('content-type');
      if (
        !contentType ||
        !contentType.toLowerCase().startsWith('multipart/form-data')
      ) {
        return c.json(
          {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: 'Evidence upload requires multipart/form-data.',
          },
          415,
        );
      }
      let body: unknown;
      try {
        body = await c.req.parseBody({ all: true });
      } catch {
        return invalidInput(c, 'Malformed multipart body.');
      }
      const files = collectUploadedFiles(body);
      if (files.length === 0) {
        return invalidInput(c, 'No files were uploaded.');
      }
      try {
        const records = await service.uploadEvidence(id, files);
        return c.json(
          {
            data: records.map((record) => decorateEvidence(app, record, id)),
          },
          201,
        );
      } catch (error) {
        return mapServiceError(c, error);
      }
    });

    routes.delete('/:id/evidence/:evidenceId', async (c) => {
      const actor = currentActor(c);
      if (!actor) return c.json({ code: 'UNAUTHENTICATED' }, 401);
      const id = parseId(c);
      if (id === undefined) return invalidInput(c, 'Invalid leave request id.');
      const evidenceId = c.req.param('evidenceId');
      if (!isUuid(evidenceId)) return invalidInput(c, 'Invalid evidence id.');
      try {
        await service.deleteEvidence(id, evidenceId);
        return c.json({ data: { id: evidenceId } });
      } catch (error) {
        return mapServiceError(c, error);
      }
    });

    router.route('/leave-requests', routes);
    return router;
  });

async function processApproval(
  context: Context<AuthEnv>,
  app: Application,
  service: LeaveRequestService,
  action: 'approve' | 'reject',
) {
  const actor = currentActor(context);
  if (!actor) return context.json({ code: 'UNAUTHENTICATED' }, 401);
  const id = parseId(context);
  if (id === undefined)
    return invalidInput(context, 'Invalid leave request id.');
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return invalidInput(context, 'Request body must be valid JSON.');
  }
  const parsed = parseApprovalBody(body);
  if (!parsed.ok) return invalidInput(context, parsed.error);
  try {
    const result =
      action === 'approve'
        ? await service.approve(id, parsed.value, actor)
        : await service.reject(id, parsed.value, actor);
    return context.json({ data: decorateDetail(app, result) });
  } catch (error) {
    return mapServiceError(context, error);
  }
}

/**
 * Evidence content route. Public path, but still requires a session — anonymous
 * requests get 401 from the auth middleware.
 */
export const leaveEvidenceContentRoutes: AppRootRouteContribution<Application> =
  defineRootRoutes((app: Application) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    router.get('/uploads/leave-evidence/:file', auth.required(), async (c) => {
      const fileParam = c.req.param('file');
      const match =
        /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.([a-z0-9]{1,32}))?$/i.exec(
          fileParam,
        );
      if (!match) return c.notFound();
      const record = await app.container
        .resolve(leaveRequestServiceToken)
        .findEvidenceById(match[1]);
      if (
        !record ||
        (match[2] ?? '').toLowerCase() !== (record.ext ?? '').toLowerCase()
      ) {
        return c.notFound();
      }
      const drive = app.container.resolve(driveManagerToken);
      const disk = drive.use(record.disk);
      if (!(await disk.exists(record.key))) return c.notFound();

      c.header('Cache-Control', 'private, no-store');
      c.header('X-Content-Type-Options', 'nosniff');
      c.header('Content-Security-Policy', "sandbox; default-src 'none'");
      c.header('Content-Type', record.mimeType);
      c.header('Content-Length', String(record.size));
      const disposition = previewable(record.mimeType)
        ? 'inline'
        : 'attachment';
      c.header(
        'Content-Disposition',
        `${disposition}; filename*=UTF-8''${encodeURIComponent(record.filename)}`,
      );
      return c.body(Readable.toWeb(await disk.getStream(record.key)));
    });
    return router;
  });

function previewable(mimeType: string): boolean {
  return (
    mimeType.startsWith('image/') ||
    mimeType === 'application/pdf' ||
    mimeType.startsWith('text/') ||
    mimeType.startsWith('audio/') ||
    mimeType.startsWith('video/')
  );
}

function decorateSummary(entry: LeaveRequestSummary): LeaveRequestSummary {
  return { ...entry, days: Number(entry.days) };
}

function decorateDetail(
  app: Application,
  data: LeaveRequestDetail,
): Record<string, unknown> {
  return {
    ...data,
    days: Number(data.days),
    evidenceFiles: data.evidenceFiles.map((record) =>
      decorateEvidence(app, record, record.leaveRequestId),
    ),
  };
}

function decorateEvidence(
  app: Application,
  record: FileRecord,
  leaveRequestId: number | null,
): Record<string, unknown> {
  const files = app.container
    .resolve(serverFileRepositoryManagerToken)
    .repository(EVIDENCE_COLLECTION, {
      disk: EVIDENCE_DISK,
      accessPath: EVIDENCE_ACCESS_PATH,
    });
  const base = app.publicBasePath.replace(/\/+$/u, '');
  return {
    ...record,
    leaveRequestId,
    contentUrl: `${base}${files.getUrl(record)}`,
  };
}

function currentActor(context: Context<AuthEnv>): LeaveRequestActor | null {
  const authenticated = context.get('auth');
  if (!authenticated?.user) return null;
  const rawId = authenticated.user.id;
  const numericId = typeof rawId === 'number' ? rawId : Number(rawId);
  const id = Number.isInteger(numericId) ? numericId : null;
  return {
    id,
    name:
      typeof authenticated.user.name === 'string' &&
      authenticated.user.name.trim()
        ? authenticated.user.name.trim()
        : String(
            authenticated.user.email ?? authenticated.user.id ?? String(id),
          ),
  };
}

function parseId(context: Context<AuthEnv>): number | undefined {
  const raw = context.req.param('id');
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function collectUploadedFiles(body: unknown): readonly File[] {
  if (typeof body !== 'object' || body === null) return [];
  const value = (body as Record<string, unknown>)['file'];
  if (value instanceof File) return [value];
  if (Array.isArray(value)) {
    return value.filter((item): item is File => item instanceof File);
  }
  return [];
}

function parseCreateBody(body: unknown):
  | {
      ok: true;
      value: {
        type: LeaveRequestType;
        startAt: string;
        endAt: string;
        days: number;
        reason: string;
      };
    }
  | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be an object.' };
  }
  const record = body as Record<string, unknown>;
  const type = record['type'];
  const startAt = record['startAt'];
  const endAt = record['endAt'];
  const days = record['days'];
  const reason = record['reason'];
  if (
    typeof type !== 'string' ||
    !(LEAVE_REQUEST_TYPES as readonly string[]).includes(type)
  ) {
    return {
      ok: false,
      error: 'type must be one of personal, sick, annual, compensatory.',
    };
  }
  const start = toDate(startAt);
  const end = toDate(endAt);
  if (!start || !end) {
    return {
      ok: false,
      error: 'startAt and endAt must be valid ISO date-time strings.',
    };
  }
  if (end < start) {
    return { ok: false, error: 'endAt must not be earlier than startAt.' };
  }
  if (
    typeof days !== 'number' ||
    !Number.isFinite(days) ||
    days <= 0 ||
    days > 3650
  ) {
    return { ok: false, error: 'days must be a positive number up to 3650.' };
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    return { ok: false, error: 'reason must be a non-empty string.' };
  }
  if (reason.trim().length > 2000) {
    return { ok: false, error: 'reason must be at most 2000 characters.' };
  }
  return {
    ok: true,
    value: {
      type: type as LeaveRequestType,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      days,
      reason: reason.trim(),
    },
  };
}

function parseApprovalBody(
  body: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be an object.' };
  }
  const comment = (body as Record<string, unknown>)['comment'];
  if (typeof comment !== 'string' || comment.trim().length === 0) {
    return { ok: false, error: 'comment is required.' };
  }
  if (comment.trim().length > 1000) {
    return { ok: false, error: 'comment must be at most 1000 characters.' };
  }
  return { ok: true, value: comment.trim() };
}

function toDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function invalidInput(context: Context<AuthEnv>, message: string): Response {
  return context.json({ code: 'INVALID_INPUT', message }, 400);
}

function notFound(context: Context<AuthEnv>): Response {
  return context.json(
    { code: 'NOT_FOUND', message: 'Leave request not found.' },
    404,
  );
}

function mapServiceError(context: Context<AuthEnv>, error: unknown): Response {
  if (error instanceof LeaveRequestInvalidInputError) {
    return context.json({ code: error.code, message: error.message }, 400);
  }
  if (error instanceof LeaveRequestNotFoundError) {
    return context.json({ code: error.code, message: error.message }, 404);
  }
  if (error instanceof LeaveEvidenceNotFoundError) {
    return context.json({ code: error.code, message: error.message }, 404);
  }
  if (error instanceof LeaveRequestAlreadyProcessedError) {
    return context.json(
      { code: error.code, message: error.message, status: error.status },
      409,
    );
  }
  throw error;
}

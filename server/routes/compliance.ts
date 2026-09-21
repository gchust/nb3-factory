import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context, type MiddlewareHandler } from 'hono';

import {
  complianceServiceToken,
  ComplianceError,
  type ComplianceService,
} from '../providers/compliance.js';

function numberParam(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Coerce a JSON or form value to a string without ever falling back to `[object Object]`. */
function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return fallback;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function contentDisposition(filename: string, inline: boolean): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

const SCRIPTABLE_MIME = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'application/xml',
  'text/xml',
]);

function safeContentType(mimeType: string): string {
  if (SCRIPTABLE_MIME.has(mimeType)) return 'text/plain; charset=utf-8';
  if (mimeType.startsWith('text/')) return `${mimeType}; charset=utf-8`;
  return mimeType;
}

export function createComplianceRoutes(options: {
  auth: { required(): MiddlewareHandler<AuthEnv> };
  service: ComplianceService;
}): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();
  const { auth, service } = options;

  routes.use('*', auth.required());

  async function withContext<T>(
    context: Context<AuthEnv>,
    action: (
      access: Awaited<ReturnType<ComplianceService['getAccess']>>,
    ) => Promise<T>,
  ) {
    const session = context.get('auth');
    if (!session?.user) return context.json({ code: 'UNAUTHORIZED' }, 401);
    try {
      const access = await service.getAccess(session.user.id);
      const data = await action(access);
      return context.json({ data });
    } catch (error) {
      if (error instanceof ComplianceError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status as 400,
        );
      }
      throw error;
    }
  }

  routes.get('/me', (context) =>
    withContext(context, async (access) => ({
      ...access,
      memberships: await Promise.all(
        access.memberships.map(async (membership) => membership),
      ),
    })),
  );

  routes.get('/organizations', (context) =>
    withContext(context, (access) => service.listOrganizations(access)),
  );
  routes.post('/organizations', (context) =>
    withContext(context, async (access) => {
      const body = parseJsonObject(await context.req.json());
      return service.createOrganization(access, {
        name: asString(body.name),
        code: asString(body.code),
        description:
          body.description === undefined
            ? undefined
            : asString(body.description),
      });
    }),
  );

  routes.get('/members', (context) =>
    withContext(context, (access) => service.listMembers(access)),
  );
  routes.get('/users', (context) =>
    withContext(context, (access) => service.listUsers(access)),
  );
  routes.post('/members', (context) =>
    withContext(context, async (access) => {
      const body = parseJsonObject(await context.req.json());
      return service.assignMember(access, {
        userId: asString(body.userId),
        role: body.role as never,
        organizationId:
          numberParam(
            body.organizationId === null
              ? undefined
              : asString(body.organizationId),
          ) ?? null,
        supplierId:
          numberParam(
            body.supplierId === null ? undefined : asString(body.supplierId),
          ) ?? null,
        note: body.note === undefined ? null : asString(body.note),
      });
    }),
  );
  routes.delete('/members/:id', (context) =>
    withContext(context, async (access) => {
      await service.removeMember(access, Number(context.req.param('id')));
      return { ok: true };
    }),
  );

  routes.get('/suppliers', (context) =>
    withContext(context, (access) =>
      service.listSuppliers(access, {
        status: context.req.query('status'),
        organizationId: numberParam(context.req.query('organizationId')),
        search: context.req.query('search'),
      }),
    ),
  );
  routes.post('/suppliers', (context) =>
    withContext(context, async (access) => {
      const body = parseJsonObject(await context.req.json());
      return service.createSupplier(access, body);
    }),
  );
  routes.get('/suppliers/:id', (context) =>
    withContext(context, (access) =>
      service.getSupplier(access, Number(context.req.param('id'))),
    ),
  );
  routes.patch('/suppliers/:id', (context) =>
    withContext(context, async (access) => {
      const body = parseJsonObject(await context.req.json());
      return service.updateSupplier(
        access,
        Number(context.req.param('id')),
        body,
      );
    }),
  );
  routes.delete('/suppliers/:id', (context) =>
    withContext(context, async (access) => {
      await service.deleteSupplier(access, Number(context.req.param('id')));
      return { ok: true };
    }),
  );
  routes.post('/suppliers/:id/submit', (context) =>
    withContext(context, (access) =>
      service.submitSupplier(access, Number(context.req.param('id'))),
    ),
  );
  routes.post('/suppliers/:id/review', (context) =>
    withContext(context, async (access) => {
      const body = parseJsonObject(await context.req.json());
      return service.reviewSupplier(access, Number(context.req.param('id')), {
        decision: body.decision as 'approved' | 'rejected',
        reason: body.reason === undefined ? undefined : asString(body.reason),
        comments:
          body.comments === undefined ? undefined : asString(body.comments),
        reviewYear: numberParam(
          body.reviewYear === undefined ? undefined : asString(body.reviewYear),
        ),
      });
    }),
  );

  routes.get('/suppliers/:id/qualifications', (context) =>
    withContext(context, (access) =>
      service.listQualifications(access, {
        supplierId: Number(context.req.param('id')),
      }),
    ),
  );
  routes.post('/suppliers/:id/qualifications', (context) =>
    withContext(context, async (access) => {
      const body = parseJsonObject(await context.req.json());
      return service.createQualification(
        access,
        Number(context.req.param('id')),
        body,
      );
    }),
  );
  routes.get('/qualifications', (context) =>
    withContext(context, (access) =>
      service.listQualifications(access, {
        type: context.req.query('type'),
        supplierId: numberParam(context.req.query('supplierId')),
      }),
    ),
  );
  routes.patch('/qualifications/:id', (context) =>
    withContext(context, async (access) => {
      const body = parseJsonObject(await context.req.json());
      return service.updateQualification(
        access,
        Number(context.req.param('id')),
        body,
      );
    }),
  );
  routes.delete('/qualifications/:id', (context) =>
    withContext(context, async (access) => {
      await service.deleteQualification(
        access,
        Number(context.req.param('id')),
      );
      return { ok: true };
    }),
  );

  routes.get('/reviews', (context) =>
    withContext(context, (access) =>
      service.listReviews(access, {
        supplierId: numberParam(context.req.query('supplierId')),
      }),
    ),
  );

  routes.get('/contracts', (context) =>
    withContext(context, (access) =>
      service.listContracts(access, {
        status: context.req.query('status'),
        supplierId: numberParam(context.req.query('supplierId')),
      }),
    ),
  );
  routes.post('/contracts', (context) =>
    withContext(context, async (access) => {
      const body = parseJsonObject(await context.req.json());
      return service.createContract(access, body);
    }),
  );
  routes.get('/contracts/:id', (context) =>
    withContext(context, (access) =>
      service.getContract(access, Number(context.req.param('id'))),
    ),
  );
  routes.patch('/contracts/:id', (context) =>
    withContext(context, async (access) => {
      const body = parseJsonObject(await context.req.json());
      return service.updateContract(
        access,
        Number(context.req.param('id')),
        body,
      );
    }),
  );
  routes.delete('/contracts/:id', (context) =>
    withContext(context, async (access) => {
      await service.deleteContract(access, Number(context.req.param('id')));
      return { ok: true };
    }),
  );

  routes.get('/files', (context) =>
    withContext(context, (access) =>
      service.listFiles(access, {
        supplierId: numberParam(context.req.query('supplierId')),
        contractId: numberParam(context.req.query('contractId')),
        organizationId: numberParam(context.req.query('organizationId')),
      }),
    ),
  );
  routes.post('/files', (context) =>
    withContext(context, async (access) => {
      const form = await context.req.formData();
      const supplierId = numberParam(asString(form.get('supplierId')));
      const contractId = numberParam(asString(form.get('contractId')));
      const organizationId = numberParam(asString(form.get('organizationId')));
      const category = asString(form.get('category'), 'other');
      const note = form.get('note');
      let organization = organizationId;
      if (organization === undefined && supplierId !== undefined) {
        const supplier = await service.getSupplier(access, supplierId);
        organization = Number(supplier.organizationId);
      }
      if (organization === undefined && contractId !== undefined) {
        const contract = await service.getContract(access, contractId);
        organization = Number(contract.organizationId);
      }
      if (organization === undefined) {
        throw ComplianceError.badRequest(
          'A file must belong to a supplier or a contract.',
          'ASSOCIATION_REQUIRED',
        );
      }
      const entries = form.getAll('files').concat(form.getAll('file'));
      const uploaded: Record<string, unknown>[] = [];
      for (const entry of entries) {
        if (typeof entry === 'string') continue;
        const bytes = new Uint8Array(await entry.arrayBuffer());
        uploaded.push(
          await service.createFile(access, {
            filename: entry.name || 'unnamed',
            mimeType: entry.type || undefined,
            category,
            note: note === null ? null : asString(note),
            organizationId: organization,
            supplierId: supplierId ?? null,
            contractId: contractId ?? null,
            data: bytes,
          }),
        );
      }
      if (uploaded.length === 0) {
        throw ComplianceError.badRequest(
          'No file was uploaded.',
          'FILE_REQUIRED',
        );
      }
      return uploaded;
    }),
  );
  routes.patch('/files/:id', (context) =>
    withContext(context, async (access) => {
      const body = parseJsonObject(await context.req.json());
      return service.updateFile(access, context.req.param('id'), {
        note:
          'note' in body
            ? body.note === null
              ? null
              : asString(body.note)
            : undefined,
        category: 'category' in body ? asString(body.category) : undefined,
      });
    }),
  );
  routes.delete('/files/:id', (context) =>
    withContext(context, async (access) => {
      await service.deleteFile(access, context.req.param('id'));
      return { ok: true };
    }),
  );

  async function fileResponse(context: Context<AuthEnv>, download: boolean) {
    const session = context.get('auth');
    if (!session?.user) return context.json({ code: 'UNAUTHORIZED' }, 401);
    try {
      const access = await service.getAccess(session.user.id);
      const file = await service.getFileContent(
        access,
        String(context.req.param('id')),
      );
      const contentType = download
        ? file.mimeType
        : safeContentType(file.mimeType);
      const body = new Uint8Array(file.data);
      return context.body(body, 200, {
        'Content-Type': contentType,
        'Content-Length': String(body.byteLength),
        'Content-Disposition': contentDisposition(file.filename, !download),
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, no-store',
      });
    } catch (error) {
      if (error instanceof ComplianceError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status as 404,
        );
      }
      throw error;
    }
  }

  routes.get('/files/:id/content', (context) => fileResponse(context, false));
  routes.get('/files/:id/download', (context) => fileResponse(context, true));

  routes.get('/dashboard', (context) =>
    withContext(context, (access) => service.dashboard(access)),
  );
  routes.get('/risks', (context) =>
    withContext(context, (access) => service.risks(access)),
  );

  return routes;
}

export const complianceApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(complianceServiceToken);
    router.route('/compliance', createComplianceRoutes({ auth, service }));
    return router;
  });

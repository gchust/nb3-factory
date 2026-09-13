import { Readable } from 'node:stream';

import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { driveManagerToken } from '@nocobase/app-server/drive';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';

import {
  HrError,
  hrServiceToken,
  invalidInput,
  notFound,
  type HrActor,
} from '../providers/hr.js';

const ATTACHMENT_REPOSITORY = 'hrAttachments';
const ATTACHMENT_DISK = 'local';
const ATTACHMENT_ACCESS_PATH = '/uploads/hr-attachments';
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/**
 * Application-owned HR API. Every route is authenticated; the service layer
 * applies role and record-scope rules (own records, own department, HR/admin).
 */
export const hrRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const routes = new Hono<AuthEnv>();
    const auth = app.container.resolve(authenticationToken);
    const hr = app.container.resolve(hrServiceToken);
    const database = app.container.resolve(databaseManagerToken);

    routes.onError((error, _context) => {
      if (error instanceof HrError) {
        return new Response(
          JSON.stringify({
            code: error.code,
            message: error.message,
            ...error.details,
          }),
          {
            status: error.httpStatus,
            headers: { 'content-type': 'application/json' },
          },
        );
      }
      throw error;
    });

    routes.use('*', auth.required());

    const actor = async (
      context: { get: (key: 'auth') => AuthEnv['Variables']['auth'] },
      provision = false,
    ): Promise<HrActor> => {
      const session = context.get('auth');
      const user = session?.user;
      if (!user)
        throw new HrError('HR_UNAUTHENTICATED', 401, 'Sign in required.');
      const name =
        (typeof user.name === 'string' && user.name.trim()) ||
        (typeof user.email === 'string' && user.email.trim()) ||
        String(user.id);
      return hr.resolveActor(String(user.id), name, { provision });
    };

    // -- current account ---------------------------------------------------

    routes.get('/me', async (context) => {
      const current = await actor(context, true);
      return context.json({
        data: {
          userId: current.userId,
          name: current.name,
          roles: {
            admin: current.isAdmin,
            hr: current.isHr,
            manager: current.isManager,
            employee: current.isEmployee,
          },
          canApprove: current.isAdmin || current.isHr || current.isManager,
          canManage: current.isAdmin || current.isHr,
          employee: current.employee
            ? {
                id: current.employee.id,
                name: current.employee.name,
                employeeNo: current.employee.employeeNo,
                departmentId: current.employee.departmentId,
                annualLeaveDays: current.employee.annualLeaveDays,
              }
            : null,
        },
      });
    });

    // -- departments -------------------------------------------------------

    routes.get('/departments', async (context) =>
      context.json({ data: await hr.listDepartments() }),
    );

    routes.post('/departments', async (context) => {
      const current = await actor(context);
      const body = await readJson(context);
      return context.json(
        { data: await hr.createDepartment(body, current) },
        201,
      );
    });

    routes.patch('/departments/:id', async (context) => {
      const current = await actor(context);
      const body = await readJson(context);
      return context.json({
        data: await hr.updateDepartment(
          parseId(context.req.param('id')),
          body,
          current,
        ),
      });
    });

    // -- employees ---------------------------------------------------------

    routes.get('/employees', async (context) => {
      const current = await actor(context, true);
      const departmentId = parseOptionalId(
        context.req.query('departmentId'),
        'departmentId',
      );
      return context.json({
        data: await hr.listEmployees({ departmentId }, current),
      });
    });

    routes.post('/employees', async (context) => {
      const current = await actor(context);
      const body = await readJson(context);
      return context.json(
        { data: await hr.createEmployee(body, current) },
        201,
      );
    });

    routes.patch('/employees/:id', async (context) => {
      const current = await actor(context);
      const body = await readJson(context);
      return context.json({
        data: await hr.updateEmployee(
          parseId(context.req.param('id')),
          body,
          current,
        ),
      });
    });

    // -- leave requests ----------------------------------------------------

    routes.get('/leave-requests', async (context) => {
      const current = await actor(context, true);
      const filter: { status?: string; employeeId?: number } = {};
      const status = context.req.query('status');
      if (status) filter.status = status;
      const employeeId = parseOptionalId(
        context.req.query('employeeId'),
        'employeeId',
      );
      if (employeeId !== undefined) filter.employeeId = employeeId;
      return context.json({
        data: await hr.listLeaveRequests(filter, current),
      });
    });

    routes.post('/leave-requests', async (context) => {
      const current = await actor(context, true);
      const body = await readJson(context);
      return context.json(
        { data: await hr.createLeaveRequest(body, current) },
        201,
      );
    });

    routes.patch('/leave-requests/:id', async (context) => {
      const current = await actor(context, true);
      const body = await readJson(context);
      return context.json({
        data: await hr.updateLeaveRequest(
          parseId(context.req.param('id')),
          body,
          current,
        ),
      });
    });

    routes.post('/leave-requests/:id/decision', async (context) => {
      const current = await actor(context);
      const body = await readJson(context);
      return context.json({
        data: await hr.decideLeaveRequest(
          parseId(context.req.param('id')),
          body,
          current,
        ),
      });
    });

    // -- overtime requests -------------------------------------------------

    routes.get('/overtime-requests', async (context) => {
      const current = await actor(context, true);
      const filter: { status?: string; employeeId?: number } = {};
      const status = context.req.query('status');
      if (status) filter.status = status;
      const employeeId = parseOptionalId(
        context.req.query('employeeId'),
        'employeeId',
      );
      if (employeeId !== undefined) filter.employeeId = employeeId;
      return context.json({
        data: await hr.listOvertimeRequests(filter, current),
      });
    });

    routes.post('/overtime-requests', async (context) => {
      const current = await actor(context, true);
      const body = await readJson(context);
      return context.json(
        { data: await hr.createOvertimeRequest(body, current) },
        201,
      );
    });

    routes.post('/overtime-requests/:id/decision', async (context) => {
      const current = await actor(context);
      const body = await readJson(context);
      return context.json({
        data: await hr.decideOvertimeRequest(
          parseId(context.req.param('id')),
          body,
          current,
        ),
      });
    });

    // -- statistics --------------------------------------------------------

    routes.get('/statistics', async (context) => {
      const current = await actor(context);
      return context.json({ data: await hr.statistics(current) });
    });

    // -- attachments -------------------------------------------------------

    routes.post('/attachments', async (context) => {
      await actor(context, true);
      const manager = app.container.resolve(serverFileRepositoryManagerToken);
      const files = manager.repository(ATTACHMENT_REPOSITORY, {
        connection: 'main',
        disk: ATTACHMENT_DISK,
        accessPath: ATTACHMENT_ACCESS_PATH,
      });
      await files.validateCollection();
      const contentType = context.req.header('content-type') ?? '';
      if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
        throw invalidInput('Expected a multipart file upload.');
      }
      const body = await context.req.parseBody();
      const file = body.file;
      if (!(file instanceof File)) {
        throw invalidInput('A file is required.', { field: 'file' });
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        throw invalidInput('The attachment must be 5 MB or smaller.', {
          field: 'file',
        });
      }
      const result = await files.uploadOne({ file });
      return context.json(
        {
          data: {
            id: result.record.id,
            filename: result.record.filename,
            mimeType: result.record.mimeType,
            size: result.record.size,
            contentUrl: `/api/hr/attachments/${result.record.id}`,
          },
        },
        201,
      );
    });

    routes.get('/attachments/:id', async (context) => {
      const current = await actor(context, true);
      const id = context.req.param('id');
      const allowed = await hr.canAccessAttachment(id, current);
      if (!allowed) throw notFound('attachment');
      const row = await database
        .query()
        .selectFrom('hrAttachments')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw notFound('attachment');
      const drive = app.container.resolve(driveManagerToken);
      const disk = drive.use(String(row.disk));
      const stream = await disk.getStream(String(row.key));
      return context.body(Readable.toWeb(stream), 200, {
        'content-type': String(row.mimeType),
        'content-length': String(row.size),
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(
          String(row.filename),
        )}`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      });
    });

    router.route('/hr', routes);
    return router;
  },
);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function readJson(context: {
  req: { json: () => Promise<unknown> };
}): Promise<Record<string, unknown>> {
  try {
    const body = await context.req.json();
    return body && typeof body === 'object'
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseId(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw invalidInput('A valid numeric id is required.', { field: 'id' });
  }
  return id;
}

function parseOptionalId(
  value: string | undefined,
  field: string,
): number | undefined {
  if (value === undefined || value === '') return undefined;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw invalidInput(`${field} must be a valid numeric id.`, { field });
  }
  return id;
}

export default hrRoutes;

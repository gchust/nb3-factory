import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import {
  ExpenseError,
  expenseServiceToken,
  type ExpenseActor,
  type ExpenseItemInput,
  type ExpenseListFilters,
  type ExpenseReportInput,
  type ExpenseScope,
  type ExpenseService,
} from '../providers/expense.js';

const SCOPES: readonly ExpenseScope[] = ['mine', 'approvals', 'finance', 'all'];

/**
 * Reimbursement API. The router owns authentication explicitly and every handler
 * resolves the caller's business role from the application's own data before the
 * service applies the workflow rules.
 */
export const expenseApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(expenseServiceToken);
    const routes = new Hono<AuthEnv>();

    routes.use('*', auth.required());

    routes.get('/meta', (context) =>
      respond(context, async () => {
        const actor = await resolveActor(context, service);
        return context.json({ data: await service.getMeta(actor) });
      }),
    );

    routes.get('/reports', (context) =>
      respond(context, async () => {
        const actor = await resolveActor(context, service);
        const filters = parseListFilters(context);
        const result = await service.listReports(actor, filters);
        return context.json({
          data: result.data,
          meta: { total: result.total, allowed: result.allowed },
        });
      }),
    );

    routes.post('/reports', (context) =>
      respond(context, async () => {
        const actor = await resolveActor(context, service);
        const body = await readJson(context);
        const report = await service.createReport(
          actor,
          parseReportInput(body),
        );
        return context.json({ data: report }, 201);
      }),
    );

    routes.get('/reports/:id', (context) =>
      respond(context, async () => {
        const actor = await resolveActor(context, service);
        return context.json({
          data: await service.getReport(actor, context.req.param('id')),
        });
      }),
    );

    routes.put('/reports/:id', (context) =>
      respond(context, async () => {
        const actor = await resolveActor(context, service);
        const body = await readJson(context);
        const report = await service.updateReport(
          actor,
          context.req.param('id'),
          parseReportInput(body),
        );
        return context.json({ data: report });
      }),
    );

    routes.delete('/reports/:id', (context) =>
      respond(context, async () => {
        const actor = await resolveActor(context, service);
        await service.deleteReport(actor, context.req.param('id'));
        return context.body(null, 204);
      }),
    );

    routes.post('/reports/:id/submit', (context) =>
      respond(context, async () => {
        const actor = await resolveActor(context, service);
        return context.json({
          data: await service.submitReport(actor, context.req.param('id')),
        });
      }),
    );

    routes.post('/reports/:id/approve', (context) =>
      respond(context, async () => {
        const actor = await resolveActor(context, service);
        const body = await readJson(context, true);
        return context.json({
          data: await service.approveReport(
            actor,
            context.req.param('id'),
            optionalText(body?.comment),
          ),
        });
      }),
    );

    routes.post('/reports/:id/reject', (context) =>
      respond(context, async () => {
        const actor = await resolveActor(context, service);
        const body = await readJson(context);
        return context.json({
          data: await service.rejectReport(
            actor,
            context.req.param('id'),
            requiredText(body?.comment, 'A reason is required.'),
          ),
        });
      }),
    );

    routes.post('/reports/:id/pay', (context) =>
      respond(context, async () => {
        const actor = await resolveActor(context, service);
        return context.json({
          data: await service.payReport(actor, context.req.param('id')),
        });
      }),
    );

    // Receipts belong to one expense item; supporting documents belong to the report.
    routes.post('/reports/:id/items/:itemId/files', (context) =>
      respond(context, async () => {
        const actor = await resolveActor(context, service);
        const body = await readJson(context);
        return context.json({
          data: await service.linkItemFile(
            actor,
            context.req.param('id'),
            context.req.param('itemId'),
            requiredText(body?.fileId, 'A file is required.'),
          ),
        });
      }),
    );

    routes.post('/reports/:id/files', (context) =>
      respond(context, async () => {
        const actor = await resolveActor(context, service);
        const body = await readJson(context);
        return context.json({
          data: await service.linkReportFile(
            actor,
            context.req.param('id'),
            requiredText(body?.fileId, 'A file is required.'),
          ),
        });
      }),
    );

    routes.delete('/files/:fileId', (context) =>
      respond(context, async () => {
        const actor = await resolveActor(context, service);
        await service.removeFile(actor, context.req.param('fileId'));
        return context.body(null, 204);
      }),
    );

    routes.get('/statistics', (context) =>
      respond(context, async () => {
        const actor = await resolveActor(context, service);
        return context.json({
          data: await service.getStatistics(actor, parseListFilters(context)),
        });
      }),
    );

    router.route('/expenses', routes);
    return router;
  });

async function resolveActor(
  context: Context<AuthEnv>,
  service: ExpenseService,
): Promise<ExpenseActor> {
  const session = context.get('auth');
  if (!session) {
    throw new ExpenseError('UNAUTHORIZED', 'Authentication required.', 401);
  }
  return service.resolveActor(session.user.id, session.user.name ?? '');
}

async function respond(
  context: Context<AuthEnv>,
  run: () => Promise<Response>,
): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ExpenseError) {
      return context.json(
        { error: { code: error.code, message: error.message } },
        error.status as ContentfulStatusCode,
      );
    }
    throw error;
  }
}

async function readJson(
  context: Context<AuthEnv>,
  optional = false,
): Promise<Record<string, unknown> | null> {
  const raw = await context.req.text();
  if (raw.trim() === '') {
    if (optional) return null;
    throw new ExpenseError('INVALID_BODY', 'A JSON body is required.', 400);
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      throw new ExpenseError('INVALID_BODY', 'A JSON object is required.', 400);
    }
    return parsed;
  } catch (error) {
    if (error instanceof ExpenseError) throw error;
    throw new ExpenseError('INVALID_BODY', 'The JSON body is malformed.', 400);
  }
}

function parseReportInput(
  body: Record<string, unknown> | null,
): ExpenseReportInput {
  if (!body) {
    throw new ExpenseError('INVALID_BODY', 'A JSON body is required.', 400);
  }
  const rawItems = body.items;
  if (!Array.isArray(rawItems)) {
    throw new ExpenseError(
      'ITEMS_REQUIRED',
      'At least one expense item is required.',
      400,
    );
  }
  const items: ExpenseItemInput[] = rawItems.map((raw) => {
    if (!isRecord(raw)) {
      throw new ExpenseError(
        'INVALID_ITEM',
        'Each item must be an object.',
        400,
      );
    }
    return {
      id: optionalText(raw.id),
      categoryId: requiredText(raw.categoryId, 'A category is required.'),
      expenseDate: requiredText(raw.expenseDate, 'A date is required.'),
      amount: Number(raw.amount),
      description: optionalText(raw.description),
    };
  });
  return { purpose: optionalText(body.purpose), items };
}

function parseListFilters(context: Context<AuthEnv>): ExpenseListFilters {
  const scope = context.req.query('scope');
  return {
    scope:
      scope && SCOPES.includes(scope as ExpenseScope)
        ? (scope as ExpenseScope)
        : 'mine',
    status: context.req.query('status'),
    categoryId: context.req.query('categoryId'),
    search: context.req.query('search'),
    from: context.req.query('from'),
    to: context.req.query('to'),
  };
}

function requiredText(value: unknown, message: string): string {
  const text = optionalText(value);
  if (!text) throw new ExpenseError('INVALID_INPUT', message, 400);
  return text;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

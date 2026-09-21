import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type Context } from 'hono';

import { FILE_KINDS, type FileKind } from '../providers/delivery/constants.js';
import { DeliveryError, badRequest } from '../providers/delivery/errors.js';
import { registerAccount } from '../providers/delivery/registration.js';
import { deliveryServiceToken } from '../providers/delivery/index.js';
import type {
  DeliveryContext,
  DeliveryService,
} from '../providers/delivery/service.js';

type Row = Record<string, unknown>;

async function readJson(context: Context): Promise<Row> {
  try {
    const value: unknown = await context.req.json();
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Row;
    }
    return {};
  } catch {
    return {};
  }
}

function toId(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest(
      'INVALID_IDENTIFIER',
      `${label} is not a valid identifier.`,
    );
  }
  return parsed;
}

function toFileKind(value: string | undefined): FileKind {
  if (value && (FILE_KINDS as readonly string[]).includes(value)) {
    return value as FileKind;
  }
  throw badRequest('UNKNOWN_FILE_KIND', 'Unknown file kind.');
}

function toSearchParams(context: Context): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(context.req.query())) {
    if (value !== undefined) query[key] = value;
  }
  return query;
}

export const deliveryApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const database = app.container.resolve(databaseManagerToken);
    const delivery =
      app.container.resolve<DeliveryService>(deliveryServiceToken);

    // Public by design: the sign-up form is reachable without a session, exactly
    // like the authentication plugin's own registration endpoint. It creates the
    // credential account with the issuer column the authentication schema
    // requires, which the plugin's built-in sign-up path omits.
    const publicRoutes = new Hono();
    publicRoutes.post('/register', async (context) => {
      try {
        const input = await readJson(context);
        const account = await registerAccount(database.query(), input);
        return context.json({ data: account }, 201);
      } catch (error) {
        if (error instanceof DeliveryError) {
          return context.json(
            { code: error.code, message: error.message },
            error.status,
          );
        }
        throw error;
      }
    });

    const routes = new Hono<AuthEnv>();

    const contextOf = async (
      context: Context<AuthEnv>,
    ): Promise<DeliveryContext> => {
      const session = context.get('auth');
      const user = session?.user;
      if (!user?.id) {
        throw new DeliveryError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
      }
      const name =
        (typeof user.name === 'string' && user.name.trim()) || String(user.id);
      return delivery.contextFor(String(user.id), name);
    };

    const respond = (
      handler: (context: Context<AuthEnv>) => Promise<Response | undefined>,
    ) => {
      return async (context: Context<AuthEnv>): Promise<Response> => {
        try {
          const response = await handler(context);
          if (response) return response;
          return context.json({ data: null });
        } catch (error) {
          if (error instanceof DeliveryError) {
            return context.json(
              { code: error.code, message: error.message },
              error.status,
            );
          }
          throw error;
        }
      };
    };

    routes.use('*', auth.required());

    routes.get(
      '/dashboard',
      respond(async (context) => {
        const ctx = await contextOf(context);
        return context.json({ data: await delivery.dashboard(ctx) });
      }),
    );

    routes.get(
      '/users',
      respond(async (context) => {
        const ctx = await contextOf(context);
        return context.json({ data: await delivery.listUsers(ctx) });
      }),
    );

    routes.get(
      '/customers',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const query = toSearchParams(context);
        return context.json({
          data: await delivery.listCustomers(ctx, {
            search: query.search,
            page: query.page,
            pageSize: query.pageSize,
          }),
        });
      }),
    );

    routes.post(
      '/customers',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const input = await readJson(context);
        return context.json({
          data: await delivery.createCustomer(ctx, input),
        });
      }),
    );

    routes.put(
      '/customers/:id',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Customer');
        const input = await readJson(context);
        return context.json({
          data: await delivery.updateCustomer(ctx, id, input),
        });
      }),
    );

    routes.get(
      '/contacts',
      respond(async (context) => {
        await contextOf(context);
        const query = toSearchParams(context);
        return context.json({
          data: await delivery.listContacts({ customerId: query.customerId }),
        });
      }),
    );

    routes.get(
      '/projects',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const query = toSearchParams(context);
        return context.json({
          data: await delivery.listContracts(ctx, {
            search: query.search,
            status: query.status,
            customerId: query.customerId,
            page: query.page,
            pageSize: query.pageSize,
          }),
        });
      }),
    );

    routes.post(
      '/projects',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const input = await readJson(context);
        return context.json({
          data: await delivery.createContract(ctx, input),
        });
      }),
    );

    routes.get(
      '/projects/:id',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Contract');
        return context.json({ data: await delivery.getContract(ctx, id) });
      }),
    );

    routes.put(
      '/projects/:id',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Contract');
        const input = await readJson(context);
        return context.json({
          data: await delivery.updateContract(ctx, id, input),
        });
      }),
    );

    routes.post(
      '/projects/:id/status',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Contract');
        const input = await readJson(context);
        return context.json({
          data: await delivery.changeContractStatus(ctx, id, input.status),
        });
      }),
    );

    routes.post(
      '/projects/:id/members',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Contract');
        const input = await readJson(context);
        return context.json({
          data: await delivery.addContractMember(ctx, id, input),
        });
      }),
    );

    routes.delete(
      '/projects/:id/members/:memberId',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Contract');
        const memberId = toId(context.req.param('memberId'), 'Member');
        return context.json({
          data: await delivery.removeContractMember(ctx, id, memberId),
        });
      }),
    );

    routes.post(
      '/projects/:id/changes',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Contract');
        const input = await readJson(context);
        return context.json({
          data: await delivery.addContractChange(ctx, id, input),
        });
      }),
    );

    routes.post(
      '/projects/:id/files',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Contract');
        const input = await readJson(context);
        const fileIds = Array.isArray(input.fileIds)
          ? input.fileIds.filter(
              (value): value is string => typeof value === 'string',
            )
          : [];
        return context.json({
          data: await delivery.linkContractFiles(ctx, id, fileIds),
        });
      }),
    );

    routes.post(
      '/projects/:id/milestones',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Contract');
        const input = await readJson(context);
        const milestone = await delivery.createMilestone(ctx, id, input);
        return context.json({ data: milestone });
      }),
    );

    routes.put(
      '/milestones/:id',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Milestone');
        const input = await readJson(context);
        return context.json({
          data: await delivery.updateMilestone(ctx, id, input),
        });
      }),
    );

    routes.get(
      '/milestones/:id/deliverables',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Milestone');
        return context.json({
          data: await delivery.listDeliverables(ctx, id),
        });
      }),
    );

    routes.post(
      '/milestones/:id/deliverables',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Milestone');
        const input = await readJson(context);
        return context.json({
          data: await delivery.createDeliverable(ctx, id, input),
        });
      }),
    );

    routes.post(
      '/milestones/:id/receivable',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Milestone');
        return context.json({
          data: await delivery.confirmReceivable(ctx, id),
        });
      }),
    );

    routes.get(
      '/tasks/:id/versions',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Deliverable');
        return context.json({ data: await delivery.listVersions(ctx, id) });
      }),
    );

    routes.post(
      '/tasks/:id/versions',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Deliverable');
        const input = await readJson(context);
        return context.json({
          data: await delivery.submitVersion(ctx, id, input),
        });
      }),
    );

    routes.put(
      '/tasks/:id',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Deliverable');
        const input = await readJson(context);
        return context.json({
          data: await delivery.updateDeliverable(ctx, id, input),
        });
      }),
    );

    routes.get(
      '/issues',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const query = toSearchParams(context);
        return context.json({
          data: await delivery.listIssues(ctx, {
            projectId: query.projectId,
            status: query.status,
            page: query.page,
            pageSize: query.pageSize,
          }),
        });
      }),
    );

    routes.post(
      '/issues',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const input = await readJson(context);
        return context.json({ data: await delivery.createIssue(ctx, input) });
      }),
    );

    routes.get(
      '/issues/:id',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Issue');
        return context.json({ data: await delivery.getIssue(ctx, id) });
      }),
    );

    routes.put(
      '/issues/:id',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Issue');
        const input = await readJson(context);
        return context.json({
          data: await delivery.updateIssue(ctx, id, input),
        });
      }),
    );

    routes.post(
      '/versions/:id/approve',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Version');
        const input = await readJson(context);
        return context.json({
          data: await delivery.approveVersion(ctx, id, input.comment),
        });
      }),
    );

    routes.post(
      '/versions/:id/return',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Version');
        const input = await readJson(context);
        return context.json({
          data: await delivery.returnVersion(ctx, id, input.comment),
        });
      }),
    );

    routes.post(
      '/versions/:id/withdraw',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Version');
        return context.json({ data: await delivery.withdrawVersion(ctx, id) });
      }),
    );

    routes.get(
      '/acceptance-queue',
      respond(async (context) => {
        const ctx = await contextOf(context);
        return context.json({ data: await delivery.acceptanceQueue(ctx) });
      }),
    );

    routes.get(
      '/settlements',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const query = toSearchParams(context);
        return context.json({
          data: await delivery.listReceivables(ctx, {
            status: query.status,
            projectId: query.projectId,
            page: query.page,
            pageSize: query.pageSize,
          }),
        });
      }),
    );

    routes.get(
      '/settlements/:id',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Receivable');
        return context.json({ data: await delivery.getReceivable(ctx, id) });
      }),
    );

    routes.post(
      '/settlements/:id/payments',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Receivable');
        const input = await readJson(context);
        return context.json({
          data: await delivery.registerPayment(ctx, id, input),
        });
      }),
    );

    routes.post(
      '/payments/:id/files',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const id = toId(context.req.param('id'), 'Payment');
        const input = await readJson(context);
        const fileIds = Array.isArray(input.fileIds)
          ? input.fileIds.filter(
              (value): value is string => typeof value === 'string',
            )
          : [];
        return context.json({
          data: await delivery.linkPaymentFiles(ctx, id, fileIds),
        });
      }),
    );

    routes.patch(
      '/files/:kind/:fileId',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const kind = toFileKind(context.req.param('kind'));
        const fileId = context.req.param('fileId') ?? '';
        const input = await readJson(context);
        return context.json({
          data: await delivery.renameFile(ctx, kind, fileId, input.filename),
        });
      }),
    );

    routes.delete(
      '/files/:kind/:fileId',
      respond(async (context) => {
        const ctx = await contextOf(context);
        const kind = toFileKind(context.req.param('kind'));
        const fileId = context.req.param('fileId') ?? '';
        await delivery.removeFile(ctx, kind, fileId);
        return context.json({ data: { removed: true } });
      }),
    );

    router.route('/delivery', publicRoutes);
    router.route('/delivery', routes);
    return router;
  });

export default deliveryApiRoutes;

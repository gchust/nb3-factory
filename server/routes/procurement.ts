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

import {
  ProcurementError,
  procurementServiceToken,
  type AttachmentTargetType,
  type OrderInput,
  type ProcurementPrincipal,
  type ReceiptInput,
} from '../providers/procurement-service.js';

type ProcurementContext = Context<AuthEnv>;

export const procurementApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(procurementServiceToken);
    const router = new Hono();
    const routes = new Hono<AuthEnv>();

    routes.use('*', auth.required());

    const principalOf = async (
      context: ProcurementContext,
    ): Promise<ProcurementPrincipal> => {
      const session = context.get('auth');
      if (!session) {
        throw new ProcurementError(
          'UNAUTHORIZED',
          401,
          'Authentication required.',
        );
      }
      return service.principal(
        session.user.id,
        session.user.name ?? session.user.id,
      );
    };

    const handle = async (
      context: ProcurementContext,
      run: () => Promise<Response>,
    ): Promise<Response> => {
      try {
        return await run();
      } catch (error) {
        if (error instanceof ProcurementError) {
          return context.json(
            {
              code: error.code,
              message: error.message,
              ...(error.details ? { details: error.details } : {}),
            },
            error.status as 400 | 401 | 403 | 404 | 409,
          );
        }
        throw error;
      }
    };

    const readJson = async (
      context: ProcurementContext,
    ): Promise<Record<string, unknown>> => {
      try {
        const body = await context.req.json<unknown>();
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          throw new Error('not an object');
        }
        return body as Record<string, unknown>;
      } catch {
        throw new ProcurementError(
          'INVALID_JSON',
          400,
          'A JSON object body is required.',
        );
      }
    };

    routes.get('/me', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        return context.json({
          data: {
            userId: principal.userId,
            name: principal.name,
            roles: [...principal.roles],
            isAdministrator: principal.isAdministrator,
          },
        });
      }),
    );

    routes.get('/dashboard', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        return context.json({ data: await service.dashboard(principal) });
      }),
    );

    // Suppliers
    routes.get('/suppliers', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        return context.json({ data: await service.listSuppliers(principal) });
      }),
    );

    routes.post('/suppliers', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        const body = await readJson(context);
        return context.json(
          { data: await service.createSupplier(principal, body) },
          201,
        );
      }),
    );

    routes.get('/suppliers/:id', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        return context.json({
          data: await service.getSupplier(
            principal,
            Number(context.req.param('id')),
          ),
        });
      }),
    );

    routes.patch('/suppliers/:id', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        const body = await readJson(context);
        return context.json({
          data: await service.updateSupplier(
            principal,
            Number(context.req.param('id')),
            body,
          ),
        });
      }),
    );

    // Materials
    routes.get('/materials', (context) =>
      handle(context, async () => {
        await principalOf(context);
        return context.json({ data: await service.listMaterials() });
      }),
    );

    routes.post('/materials', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        const body = await readJson(context);
        return context.json(
          { data: await service.createMaterial(principal, body) },
          201,
        );
      }),
    );

    routes.patch('/materials/:id', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        const body = await readJson(context);
        return context.json({
          data: await service.updateMaterial(
            principal,
            Number(context.req.param('id')),
            body,
          ),
        });
      }),
    );

    // Orders
    routes.get('/orders/todos', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        return context.json({ data: await service.todoOrders(principal) });
      }),
    );

    routes.get('/orders', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        return context.json({
          data: await service.listOrders(principal, {
            status: context.req.query('status') || undefined,
            scope: context.req.query('scope') || undefined,
          }),
        });
      }),
    );

    routes.post('/orders', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        const body = await readJson(context);
        return context.json(
          {
            data: await service.createOrder(
              principal,
              body as unknown as OrderInput,
            ),
          },
          201,
        );
      }),
    );

    routes.get('/orders/:id', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        return context.json({
          data: await service.getOrder(
            principal,
            Number(context.req.param('id')),
          ),
        });
      }),
    );

    routes.patch('/orders/:id', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        const body = await readJson(context);
        return context.json({
          data: await service.updateOrder(
            principal,
            Number(context.req.param('id')),
            body as unknown as OrderInput,
          ),
        });
      }),
    );

    routes.post('/orders/:id/submit', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        return context.json({
          data: await service.submitOrder(
            principal,
            Number(context.req.param('id')),
          ),
        });
      }),
    );

    routes.post('/orders/:id/approve', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        return context.json({
          data: await service.approveOrder(
            principal,
            Number(context.req.param('id')),
          ),
        });
      }),
    );

    routes.post('/orders/:id/reject', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        const body = await readJson(context);
        return context.json({
          data: await service.rejectOrder(
            principal,
            Number(context.req.param('id')),
            body.reason,
          ),
        });
      }),
    );

    // Receipts
    routes.get('/receipts', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        return context.json({ data: await service.listReceipts(principal) });
      }),
    );

    routes.post('/orders/:id/receipts', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        const body = await readJson(context);
        return context.json({
          data: await service.createReceipt(
            principal,
            Number(context.req.param('id')),
            body as unknown as ReceiptInput,
          ),
        });
      }),
    );

    routes.get('/receipts/:id', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        return context.json({
          data: await service.getReceipt(
            principal,
            Number(context.req.param('id')),
          ),
        });
      }),
    );

    // Attachments
    routes.get('/attachments', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        return context.json({
          data: await service.listAttachments(
            principal,
            parseTargetType(context.req.query('targetType')),
            Number(context.req.query('targetId')),
          ),
        });
      }),
    );

    routes.post('/attachments', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        const body = await readJson(context);
        return context.json(
          { data: await service.attachFiles(principal, body) },
          201,
        );
      }),
    );

    routes.delete('/attachments/:id', (context) =>
      handle(context, async () => {
        const principal = await principalOf(context);
        return context.json({
          data: await service.removeAttachment(
            principal,
            Number(context.req.param('id')),
          ),
        });
      }),
    );

    router.route('/procurement', routes);
    return router;
  });

function parseTargetType(value: string | undefined): AttachmentTargetType {
  if (value === 'supplier' || value === 'order' || value === 'receipt') {
    return value;
  }
  throw new ProcurementError('VALIDATION_ERROR', 400, 'Invalid target type.', {
    field: 'targetType',
  });
}

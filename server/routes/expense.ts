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

import { ExpenseError } from '../providers/expense-domain.js';
import { expenseServiceToken } from '../providers/expense-service.js';

/**
 * Expense reimbursement API.
 *
 * Identity is required on every path in this contribution. Business authorization — who may see, edit, approve, review
 * or pay a claim — is decided by the expense service from the caller's roles and department, and is therefore enforced
 * on the server rather than inferred from what the browser happens to render.
 */
export const expenseApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const service = app.container.resolve(expenseServiceToken);
    const routes = new Hono<AuthEnv>();

    // An isolated sub-router: the middleware covers only the expense paths and cannot leak onto another contribution.
    routes.use('*', auth.required());

    routes.get('/me', (context) =>
      respond(context, () => service.viewerInfo(user(context))),
    );

    routes.get('/departments', (context) =>
      respond(context, () => service.listDepartments()),
    );

    routes.get('/users', (context) =>
      respond(context, () => service.listUsers(user(context))),
    );

    routes.get('/claims', (context) =>
      respond(context, () => service.listClaims(user(context))),
    );

    routes.post('/claims', (context) =>
      respond(
        context,
        async () => service.createClaim(user(context), await json(context)),
        201,
      ),
    );

    routes.get('/claims/:id', (context) =>
      respond(context, () =>
        service.hydrateClaim(user(context), claimId(context)),
      ),
    );

    routes.put('/claims/:id', (context) =>
      respond(context, async () =>
        service.updateClaim(
          user(context),
          claimId(context),
          await json(context),
        ),
      ),
    );

    routes.delete('/claims/:id', (context) =>
      respond(context, async () => {
        await service.deleteClaim(user(context), claimId(context));
        return { deleted: true };
      }),
    );

    routes.post('/claims/:id/approve', (context) =>
      respond(context, () => service.approve(user(context), claimId(context))),
    );

    routes.post('/claims/:id/reject', (context) =>
      respond(context, async () => {
        const body = await json(context);
        return service.reject(user(context), claimId(context), body.reason);
      }),
    );

    routes.post('/claims/:id/review', (context) =>
      respond(context, () => service.review(user(context), claimId(context))),
    );

    routes.post('/claims/:id/pay', (context) =>
      respond(context, async () => {
        const body = await json(context);
        return service.pay(user(context), claimId(context), body.paymentDate);
      }),
    );

    routes.get('/approvals', (context) =>
      respond(context, () => service.listApprovalQueue(user(context))),
    );

    routes.get('/payments', (context) =>
      respond(context, () => service.listPaymentQueue(user(context))),
    );

    routes.get('/loans', (context) =>
      respond(context, () =>
        service.listLoans(user(context), {
          unsettledOnly: context.req.query('unsettled') === 'true',
        }),
      ),
    );

    routes.post('/loans', (context) =>
      respond(
        context,
        async () => service.createLoan(user(context), await json(context)),
        201,
      ),
    );

    routes.get('/stats', (context) =>
      respond(context, () => service.statistics(user(context))),
    );

    router.route('/expense', routes);
    return router;
  });

function user(context: Context<AuthEnv>): string {
  const session = context.get('auth');
  if (!session?.user?.id) {
    throw new ExpenseError('UNAUTHORIZED', 'Authentication is required.', 401);
  }
  return session.user.id;
}

function claimId(context: Context<AuthEnv>): number {
  const id = Number(context.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    throw new ExpenseError('VALIDATION', 'Invalid claim id.');
  }
  return id;
}

async function json(
  context: Context<AuthEnv>,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    return typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    throw new ExpenseError('VALIDATION', 'A JSON request body is required.');
  }
}

async function respond(
  context: Context<AuthEnv>,
  run: () => Promise<unknown>,
  status: ContentfulStatusCode = 200,
): Promise<Response> {
  try {
    return context.json({ data: await run() }, status);
  } catch (error) {
    if (error instanceof ExpenseError) {
      return context.json(
        { code: error.code, message: error.message },
        error.status as ContentfulStatusCode,
      );
    }
    throw error;
  }
}

import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import {
  EquipmentDomainError,
  equipmentServiceToken,
  type EquipmentService,
  type EquipmentStatusFilter,
  type LoanStatusFilter,
} from '../providers/equipment.js';

/** Business failure code to HTTP status. Anything unlisted is a bad request. */
const STATUS_BY_CODE: Readonly<Record<string, 400 | 404 | 409 | 422>> = {
  VALIDATION_ERROR: 422,
  EQUIPMENT_NOT_FOUND: 404,
  LOAN_NOT_FOUND: 404,
  EQUIPMENT_ALREADY_BORROWED: 409,
  ASSET_NO_TAKEN: 409,
};

async function readBody(context: Context): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    return typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    // A malformed or empty body is reported by the service as a missing field.
    return {};
  }
}

async function respond<T>(
  context: Context,
  run: () => Promise<T>,
  status: 200 | 201 = 200,
): Promise<Response> {
  try {
    return context.json({ data: await run() }, status);
  } catch (error) {
    if (error instanceof EquipmentDomainError) {
      return context.json(
        { code: error.code, message: error.message, field: error.field },
        STATUS_BY_CODE[error.code] ?? 400,
      );
    }
    throw error;
  }
}

function parseEquipmentStatus(
  value: string | undefined,
): EquipmentStatusFilter {
  return value === 'available' || value === 'borrowed' ? value : 'all';
}

function parseLoanStatus(value: string | undefined): LoanStatusFilter {
  return value === 'unreturned' || value === 'returned' ? value : 'all';
}

/**
 * Equipment ledger and borrow-record endpoints under `/api`.
 *
 * Mounting under `/api` does not authenticate anything, so each sub-router
 * installs `auth.required()` on the paths it owns. The rule that a device can
 * only be lent while no unreturned loan exists, and that returning is
 * idempotent, lives in the service so the same rules apply to every caller.
 */
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const equipment: EquipmentService = app.container.resolve(
      equipmentServiceToken,
    );

    const equipmentRouter = new Hono();
    equipmentRouter.use('*', auth.required());

    equipmentRouter.get('/', async (context) => {
      const result = await equipment.listEquipment({
        search: context.req.query('search'),
        status: parseEquipmentStatus(context.req.query('status')),
      });
      return context.json({ data: result.items, stats: result.stats });
    });

    equipmentRouter.post('/', async (context) => {
      const body = await readBody(context);
      return respond(context, () => equipment.createEquipment(body), 201);
    });

    equipmentRouter.patch('/:id', async (context) => {
      const id = Number(context.req.param('id'));
      const body = await readBody(context);
      return respond(context, () => equipment.updateEquipment(id, body));
    });

    equipmentRouter.post('/:id/loans', async (context) => {
      const equipmentId = Number(context.req.param('id'));
      const body = await readBody(context);
      return respond(
        context,
        () => equipment.borrowEquipment({ ...body, equipmentId }),
        201,
      );
    });

    const loanRouter = new Hono();
    loanRouter.use('*', auth.required());

    loanRouter.get('/', async (context) => {
      const data = await equipment.listLoans({
        search: context.req.query('search'),
        status: parseLoanStatus(context.req.query('status')),
      });
      return context.json({ data });
    });

    loanRouter.post('/:id/return', async (context) => {
      const id = Number(context.req.param('id'));
      return respond(context, () => equipment.returnLoan(id));
    });

    router.route('/equipment', equipmentRouter);
    router.route('/loans', loanRouter);

    return router;
  },
);

export default apiRoutes;

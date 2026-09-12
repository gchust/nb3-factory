import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { Hono } from 'hono';

import {
  OfficeSuppliesError,
  officeSuppliesServiceToken,
  type OfficeSuppliesService,
  type OfficeSupplyInput,
  type SupplyRequisitionInput,
} from '../providers/office-supplies.js';

export const officeSuppliesApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const service = app.container.resolve<OfficeSuppliesService>(
      officeSuppliesServiceToken,
    );

    // An isolated sub-router owns every path under /office-supplies, so the
    // `*` middleware below covers the collection and every per-supply path.
    // Every handler requires a signed-in session: the module is open to all
    // logged-in users (administrative staff and employees), so identity is
    // the whole security boundary; no role-based rule is needed.
    const supplies = new Hono();
    supplies.use('*', app.container.resolve(authenticationToken).required());
    supplies.onError((error, context) => {
      if (error instanceof OfficeSuppliesError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status as ContentfulStatusCode,
        );
      }
      throw error;
    });

    supplies.get('/', async (context) =>
      context.json({ data: await service.list() }),
    );

    supplies.get('/:id', async (context) => {
      const id = supplyId(context);
      const detail = await service.find(id);
      if (!detail) {
        return supplyNotFound(context);
      }
      return context.json({ data: detail });
    });

    supplies.post('/', async (context) => {
      const input = parseSupplyInput(await readJson(context));
      const supply = await service.create(input);
      return context.json({ data: supply }, 201);
    });

    supplies.put('/:id', async (context) => {
      const input = parseSupplyInput(await readJson(context), {
        partial: true,
      });
      const supply = await service.update(supplyId(context), input);
      if (!supply) {
        return supplyNotFound(context);
      }
      return context.json({ data: supply });
    });

    supplies.delete('/:id', async (context) => {
      const id = supplyId(context);
      const deleted = await service.remove(id);
      if (!deleted) {
        return supplyNotFound(context);
      }
      return context.json({ data: { id, deleted: true } });
    });

    supplies.post('/:id/requisitions', async (context) => {
      const input = parseRequisitionInput(await readJson(context));
      const result = await service.requisition(supplyId(context), input);
      return context.json({ data: result }, 201);
    });

    router.route('/office-supplies', supplies);
    return router;
  });

function supplyId(context: Context): number {
  const raw = context.req.param('id');
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new OfficeSuppliesError(
      'INVALID_INPUT',
      'The supply id must be a positive integer.',
      400,
    );
  }
  return id;
}

function supplyNotFound(context: Context): Response {
  return context.json(
    { code: 'SUPPLY_NOT_FOUND', message: 'The office supply does not exist.' },
    404,
  );
}

async function readJson(context: Context): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    throw new OfficeSuppliesError(
      'INVALID_INPUT',
      'The request body must be valid JSON.',
      400,
    );
  }
  if (!isRecord(body)) {
    throw new OfficeSuppliesError(
      'INVALID_INPUT',
      'The request body must be a JSON object.',
      400,
    );
  }
  return body;
}

/**
 * Picks the known supply fields out of the request body. With `partial: true`
 * missing fields are simply omitted and the service merges them with the
 * stored row, so the edit form never needs to resend fields it did not touch.
 */
function parseSupplyInput(body: Record<string, unknown>): OfficeSupplyInput;
function parseSupplyInput(
  body: Record<string, unknown>,
  options: { partial: true },
): Partial<OfficeSupplyInput>;
function parseSupplyInput(
  body: Record<string, unknown>,
  options?: { partial?: boolean },
): OfficeSupplyInput | Partial<OfficeSupplyInput> {
  const input: Partial<OfficeSupplyInput> = {};
  for (const key of SUPPLY_FIELDS) {
    if (body[key] !== undefined) {
      (input as Record<string, unknown>)[key] = body[key];
    }
  }
  if (!options?.partial) {
    for (const key of [
      'code',
      'name',
      'category',
      'quantity',
      'unit',
    ] as const) {
      if (input[key] === undefined) {
        throw new OfficeSuppliesError(
          'INVALID_INPUT',
          `${key} is required.`,
          400,
        );
      }
    }
  }
  return input;
}

const SUPPLY_FIELDS = [
  'code',
  'name',
  'category',
  'quantity',
  'unit',
  'remark',
] as const;

function parseRequisitionInput(
  body: Record<string, unknown>,
): SupplyRequisitionInput {
  const requisitionedAt =
    typeof body.requisitionedAt === 'string'
      ? new Date(body.requisitionedAt)
      : body.requisitionedAt;
  return {
    requisitionedAt: requisitionedAt as Date,
    requisitioner: body.requisitioner as string,
    quantity: body.quantity as number,
    remark: body.remark as string | null | undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

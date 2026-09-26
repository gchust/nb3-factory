import { Hono, type Context } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import { defineApiRoutes } from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';

import {
  EquipmentError,
  equipmentServiceToken,
  type BorrowInput,
  type EquipmentService,
  type EquipmentStatus,
} from '../providers/equipment-service.js';

const STATUS_BY_CODE: Record<string, 400 | 404 | 409> = {
  ASSET_NO_REQUIRED: 400,
  NAME_REQUIRED: 400,
  BORROWER_REQUIRED: 400,
  EXPECTED_RETURN_REQUIRED: 400,
  ASSET_NO_TAKEN: 409,
  NOT_AVAILABLE: 409,
  EQUIPMENT_NOT_FOUND: 404,
  LOAN_NOT_FOUND: 404,
};

function toErrorResponse(context: Context, error: unknown): Response {
  if (error instanceof EquipmentError) {
    return context.json(
      {
        code: error.code,
        field: error.field ?? null,
        message: error.message,
      },
      STATUS_BY_CODE[error.code] ?? 400,
    );
  }
  throw error;
}

function parseId(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function readJson(context: Context): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await context.req.json();
    return typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function readString(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * HTTP surface for the equipment ledger and its loan history.
 *
 * Every endpoint authenticates itself: mounting under `/api` does not do that.
 * The service owns the rules; this layer only reads the request, maps business
 * failures to status codes and localized keys, and returns JSON.
 */
export const equipmentRoutes = defineApiRoutes<Application>((app) => {
  const router = new Hono();
  const auth = app.container.resolve(authenticationToken);
  const equipmentService: EquipmentService = app.container.resolve(
    equipmentServiceToken,
  );

  router.get('/equipment', auth.required(), async (context) => {
    try {
      const status = context.req.query('status');
      const result = await equipmentService.listEquipment({
        keyword: context.req.query('keyword'),
        status:
          status === 'available' || status === 'borrowed' ? status : undefined,
      });
      return context.json(result);
    } catch (error) {
      return toErrorResponse(context, error);
    }
  });

  router.get('/equipment/:id', auth.required(), async (context) => {
    try {
      const id = parseId(context.req.param('id'));
      if (id === null) {
        throw new EquipmentError(
          'EQUIPMENT_NOT_FOUND',
          'The equipment does not exist',
        );
      }
      return context.json(await equipmentService.getEquipment(id));
    } catch (error) {
      return toErrorResponse(context, error);
    }
  });

  router.post('/equipment', auth.required(), async (context) => {
    try {
      const body = await readJson(context);
      const record = await equipmentService.createEquipment({
        assetNo: readString(body, 'assetNo') ?? '',
        name: readString(body, 'name') ?? '',
        category: readString(body, 'category'),
        notes: readString(body, 'notes'),
      });
      return context.json(record, 201);
    } catch (error) {
      return toErrorResponse(context, error);
    }
  });

  router.patch('/equipment/:id', auth.required(), async (context) => {
    try {
      const id = parseId(context.req.param('id'));
      if (id === null) {
        throw new EquipmentError(
          'EQUIPMENT_NOT_FOUND',
          'The equipment does not exist',
        );
      }
      const body = await readJson(context);
      const record = await equipmentService.updateEquipment(id, {
        assetNo: readString(body, 'assetNo'),
        name: readString(body, 'name'),
        category: readString(body, 'category'),
        notes: readString(body, 'notes'),
      });
      return context.json(record);
    } catch (error) {
      return toErrorResponse(context, error);
    }
  });

  router.post('/equipment/:id/borrow', auth.required(), async (context) => {
    try {
      const id = parseId(context.req.param('id'));
      if (id === null) {
        throw new EquipmentError(
          'EQUIPMENT_NOT_FOUND',
          'The equipment does not exist',
        );
      }
      const body = await readJson(context);
      const input: BorrowInput = {
        borrower: readString(body, 'borrower') ?? '',
        purpose: readString(body, 'purpose'),
        expectedReturnAt: readString(body, 'expectedReturnAt') ?? '',
      };
      const record = await equipmentService.borrow(id, input);
      return context.json(record, 201);
    } catch (error) {
      return toErrorResponse(context, error);
    }
  });

  router.get('/equipment-loans', auth.required(), async (context) => {
    try {
      const status = context.req.query('status');
      const record = await equipmentService.listLoans({
        keyword: context.req.query('keyword'),
        status:
          status === 'active' || status === 'returned' ? status : undefined,
      });
      return context.json(record);
    } catch (error) {
      return toErrorResponse(context, error);
    }
  });

  router.post(
    '/equipment-loans/:id/return',
    auth.required(),
    async (context) => {
      try {
        const id = parseId(context.req.param('id'));
        if (id === null) {
          throw new EquipmentError('LOAN_NOT_FOUND', 'The loan does not exist');
        }
        const record = await equipmentService.returnLoan(id);
        return context.json(record);
      } catch (error) {
        return toErrorResponse(context, error);
      }
    },
  );

  return router;
});

export type { EquipmentStatus };

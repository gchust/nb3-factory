import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponse,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import {
  equipmentServiceToken,
  EquipmentCodeTakenError,
  EquipmentNotFoundError,
} from '../providers/equipment.js';
import {
  Equipment,
  EquipmentListMeta,
  EquipmentParams,
  EquipmentWriteInput,
  ListEquipmentQuery,
} from './schemas.js';

const tags = ['Equipment'];

/** The application's own error domain: its URL namespace. */
const equipmentDomain = 'equipment';

/**
 * Turn the ledger's domain errors into the standard `/api` error body. Anything else is returned unchanged, so
 * `apiErrorHandler` renders what the framework already recognizes.
 */
function toEquipmentApiError(error: unknown): unknown {
  if (error instanceof EquipmentCodeTakenError) {
    return new ApiError({
      status: 'ALREADY_EXISTS',
      reason: 'EQUIPMENT_CODE_TAKEN',
      domain: equipmentDomain,
      message: error.message,
      cause: error,
    });
  }
  if (error instanceof EquipmentNotFoundError) {
    return new ApiError({
      status: 'NOT_FOUND',
      reason: 'EQUIPMENT_NOT_FOUND',
      domain: equipmentDomain,
      message: error.message,
      cause: error,
    });
  }
  return error;
}

/**
 * `/api/equipment`: the shared equipment ledger. Every route requires a session but no further permission — the
 * ledger is shared by the whole team — so each one lists its own statuses instead of spreading `apiErrorResponses`.
 */
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const equipment = app.container.resolve(equipmentServiceToken);

    const routes = new Hono();
    routes.onError((error, context) =>
      apiErrorHandler(toEquipmentApiError(error), context),
    );
    // `/equipment/*` covers both the collection and the item routes; Hono's bare prefix would cover only the list.
    routes.use('/equipment/*', auth.required());

    routes.get(
      '/equipment',
      describeRoute({
        tags,
        summary: 'List equipment',
        operationId: 'listEquipment',
        description:
          'Pages by `page` and `pageSize`, newest first, optionally filtered by `status`.',
        responses: {
          200: listResponse(Equipment, EquipmentListMeta),
          401: apiErrorResponse(401),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('query', ListEquipmentQuery),
      async (context) => {
        const { status, page, pageSize } = context.req.valid('query');
        const { rows, total } = await equipment.list({
          status,
          page,
          pageSize,
        });
        return context.json({ data: rows, meta: { page, pageSize, total } });
      },
    );

    routes.get(
      '/equipment/:equipmentId',
      describeRoute({
        tags,
        summary: 'Get one equipment record',
        operationId: 'getEquipment',
        responses: {
          200: dataResponse(Equipment, 'The requested device.'),
          401: apiErrorResponse(401),
          404: apiErrorResponse(
            404,
            'No device has this id (`EQUIPMENT_NOT_FOUND`).',
          ),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('param', EquipmentParams),
      async (context) => {
        const { equipmentId } = context.req.valid('param');
        return context.json({ data: await equipment.get(equipmentId) });
      },
    );

    routes.post(
      '/equipment',
      describeRoute({
        tags,
        summary: 'Add an equipment record',
        operationId: 'createEquipment',
        responses: {
          201: dataResponse(Equipment, 'The created device.'),
          401: apiErrorResponse(401),
          409: apiErrorResponse(
            409,
            'Another device already uses this code (`EQUIPMENT_CODE_TAKEN`).',
          ),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('json', EquipmentWriteInput),
      async (context) => {
        const input = context.req.valid('json');
        return context.json({ data: await equipment.create(input) }, 201);
      },
    );

    routes.patch(
      '/equipment/:equipmentId',
      describeRoute({
        tags,
        summary: 'Update an equipment record',
        operationId: 'updateEquipment',
        responses: {
          200: dataResponse(Equipment, 'The updated device.'),
          401: apiErrorResponse(401),
          404: apiErrorResponse(
            404,
            'No device has this id (`EQUIPMENT_NOT_FOUND`).',
          ),
          409: apiErrorResponse(
            409,
            'Another device already uses this code (`EQUIPMENT_CODE_TAKEN`).',
          ),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('param', EquipmentParams),
      apiValidator('json', EquipmentWriteInput),
      async (context) => {
        const { equipmentId } = context.req.valid('param');
        const input = context.req.valid('json');
        return context.json({
          data: await equipment.update(equipmentId, input),
        });
      },
    );

    router.route('/', routes);
    return router;
  },
);

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  ApiError,
  apiErrorResponse,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';
import { Hono } from 'hono';

import {
  EquipmentCodeTakenError,
  EquipmentNotFoundError,
  equipmentServiceToken,
  type EquipmentService,
} from '../services/equipment.js';
import {
  CreateEquipmentInput,
  EquipmentPageMeta,
  EquipmentParams,
  EquipmentSchema,
  ListEquipmentsQuery,
  UpdateEquipmentInput,
} from './schemas.js';

const tags = ['Equipment'];
const domain = 'nb3-factory';

/** A conflict the client translates; the developer-facing message is never shown. */
export function equipmentCodeTakenError(): ApiError {
  return new ApiError({
    status: 'ALREADY_EXISTS',
    reason: 'EQUIPMENT_CODE_TAKEN',
    domain,
    message: 'Another equipment record already uses this code.',
    fieldViolations: [
      {
        field: 'code',
        description: 'The code is already used by another device.',
        reason: 'EQUIPMENT_CODE_TAKEN',
      },
    ],
  });
}

function equipmentNotFoundError(): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'EQUIPMENT_NOT_FOUND',
    domain,
    message: 'The equipment record was not found.',
  });
}

function translateEquipmentError(error: unknown): never {
  if (error instanceof EquipmentCodeTakenError) {
    throw equipmentCodeTakenError();
  }
  if (error instanceof EquipmentNotFoundError) {
    throw equipmentNotFoundError();
  }
  throw error;
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const authentication = app.container.resolve(authenticationToken);
    const service = app.container.resolve<EquipmentService>(
      equipmentServiceToken,
    );

    // Every equipment endpoint needs a signed-in person, but none has a page-level grant: the ledger is
    // shared by the whole signed-in team.
    router.use('/equipments', authentication.required());
    router.use('/equipments/*', authentication.required());

    router.get(
      '/equipments',
      describeRoute({
        tags,
        summary: 'List equipment',
        operationId: 'listEquipments',
        description:
          'A page of the shared equipment ledger, ordered by code, optionally filtered by status.',
        responses: {
          200: listResponse(EquipmentSchema, EquipmentPageMeta),
          401: apiErrorResponse(401),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('query', ListEquipmentsQuery),
      async (context) => {
        const input = context.req.valid('query');
        try {
          const result = await service.list(input);
          return context.json({
            data: result.rows,
            meta: {
              page: input.page,
              pageSize: input.pageSize,
              total: result.total,
            },
          });
        } catch (error) {
          return translateEquipmentError(error);
        }
      },
    );

    router.get(
      '/equipments/:id',
      describeRoute({
        tags,
        summary: 'Get one equipment record',
        operationId: 'getEquipment',
        responses: {
          200: dataResponse(EquipmentSchema),
          401: apiErrorResponse(401),
          404: apiErrorResponse(
            404,
            'No equipment has this id (`EQUIPMENT_NOT_FOUND`).',
          ),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('param', EquipmentParams),
      async (context) => {
        const { id } = context.req.valid('param');
        try {
          return context.json({ data: await service.get(id) });
        } catch (error) {
          return translateEquipmentError(error);
        }
      },
    );

    router.post(
      '/equipments',
      describeRoute({
        tags,
        summary: 'Create an equipment record',
        operationId: 'createEquipment',
        responses: {
          201: dataResponse(EquipmentSchema, 'The created equipment.'),
          401: apiErrorResponse(401),
          409: apiErrorResponse(
            409,
            'Another device already uses this code (`EQUIPMENT_CODE_TAKEN`).',
          ),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('json', CreateEquipmentInput),
      async (context) => {
        try {
          const equipment = await service.create(context.req.valid('json'));
          return context.json({ data: equipment }, 201);
        } catch (error) {
          return translateEquipmentError(error);
        }
      },
    );

    router.patch(
      '/equipments/:id',
      describeRoute({
        tags,
        summary: 'Update an equipment record',
        operationId: 'updateEquipment',
        responses: {
          200: dataResponse(EquipmentSchema, 'The updated equipment.'),
          401: apiErrorResponse(401),
          404: apiErrorResponse(
            404,
            'No equipment has this id (`EQUIPMENT_NOT_FOUND`).',
          ),
          409: apiErrorResponse(
            409,
            'Another device already uses this code (`EQUIPMENT_CODE_TAKEN`).',
          ),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('param', EquipmentParams),
      apiValidator('json', UpdateEquipmentInput),
      async (context) => {
        const { id } = context.req.valid('param');
        try {
          return context.json({
            data: await service.update(id, context.req.valid('json')),
          });
        } catch (error) {
          return translateEquipmentError(error);
        }
      },
    );

    return router;
  },
);

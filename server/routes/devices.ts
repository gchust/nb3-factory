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

import { DeviceError, deviceServiceToken } from '../providers/index.js';
import {
  CreateDeviceInput,
  DeviceParams,
  DeviceSchema,
  ListDevicesQuery,
  UpdateDeviceInput,
} from './schemas.js';

/** The service reports domain outcomes; only the HTTP layer chooses a status and reason for them. */
function toApiError(error: DeviceError): ApiError {
  switch (error.code) {
    case 'DEVICE_NOT_FOUND':
      return new ApiError({
        status: 'NOT_FOUND',
        reason: error.code,
        domain: 'devices',
        message: error.message,
      });
    case 'DEVICE_CODE_TAKEN':
      return new ApiError({
        status: 'ALREADY_EXISTS',
        reason: error.code,
        domain: 'devices',
        message: error.message,
      });
  }
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const devices = app.container.resolve(deviceServiceToken);

    router.onError((error, context) =>
      apiErrorHandler(
        error instanceof DeviceError ? toApiError(error) : error,
        context,
      ),
    );

    router.get(
      '/devices',
      auth.required(),
      describeRoute({
        tags: ['Devices'],
        summary: 'List devices',
        operationId: 'listDevices',
        description:
          'Lists equipment ordered by code, optionally filtered by status. Requires a signed-in session.',
        responses: {
          '200': listResponse(DeviceSchema),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('query', ListDevicesQuery),
      async (context) => {
        const { status, page, pageSize } = context.req.valid('query');
        const { rows, total } = await devices.list({
          status,
          page,
          pageSize,
        });

        return context.json({ data: rows, meta: { page, pageSize, total } });
      },
    );

    router.post(
      '/devices',
      auth.required(),
      describeRoute({
        tags: ['Devices'],
        summary: 'Create a device',
        operationId: 'createDevice',
        description:
          'Adds one device to the ledger. The code is unique across devices. Requires a signed-in session.',
        responses: {
          '201': dataResponse(DeviceSchema, 'The device was created.'),
          '401': apiErrorResponse(401),
          '409': apiErrorResponse(
            409,
            'A device with the same code already exists.',
          ),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('json', CreateDeviceInput),
      async (context) => {
        const input = context.req.valid('json');
        const device = await devices.create(input);

        return context.json({ data: device }, 201);
      },
    );

    router.get(
      '/devices/:deviceId',
      auth.required(),
      describeRoute({
        tags: ['Devices'],
        summary: 'Get one device',
        operationId: 'getDevice',
        description: 'Returns one device by id. Requires a signed-in session.',
        responses: {
          '200': dataResponse(DeviceSchema),
          '401': apiErrorResponse(401),
          '404': apiErrorResponse(404),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('param', DeviceParams),
      async (context) => {
        const { deviceId } = context.req.valid('param');
        const device = await devices.get(deviceId);

        return context.json({ data: device });
      },
    );

    router.patch(
      '/devices/:deviceId',
      auth.required(),
      describeRoute({
        tags: ['Devices'],
        summary: 'Update a device',
        operationId: 'updateDevice',
        description:
          'Changes only the fields sent. A code must remain unique. Requires a signed-in session.',
        responses: {
          '200': dataResponse(DeviceSchema),
          '401': apiErrorResponse(401),
          '404': apiErrorResponse(404),
          '409': apiErrorResponse(
            409,
            'Another device already uses the requested code.',
          ),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('param', DeviceParams),
      apiValidator('json', UpdateDeviceInput),
      async (context) => {
        const { deviceId } = context.req.valid('param');
        const input = context.req.valid('json');
        const device = await devices.update(deviceId, input);

        return context.json({ data: device });
      },
    );

    return router;
  },
);

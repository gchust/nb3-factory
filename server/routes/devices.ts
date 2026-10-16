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
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { Hono } from 'hono';

import {
  DeviceCodeTakenError,
  DeviceNotFoundError,
  deviceServiceToken,
} from '../providers/devices.js';
import {
  CreateDeviceInput,
  DeviceParams,
  DeviceSchema,
  DevicesListMeta,
  ListDevicesQuery,
  UpdateDeviceInput,
} from './schemas.js';

const tags = ['Devices'];

/**
 * The standard error body for a domain refusal the service raised. Anything else is left for `apiErrorHandler`, which
 * recognizes a refused write or an unexpected failure.
 */
function toDeviceApiError(error: unknown): unknown {
  if (error instanceof DeviceCodeTakenError) {
    return new ApiError({
      status: 'ALREADY_EXISTS',
      reason: 'DEVICE_CODE_TAKEN',
      domain: 'devices',
      message: `A device with code "${error.code}" already exists.`,
    });
  }
  if (error instanceof DeviceNotFoundError) {
    return new ApiError({
      status: 'NOT_FOUND',
      reason: 'DEVICE_NOT_FOUND',
      domain: 'devices',
      message: `Device "${error.deviceId}" was not found.`,
    });
  }
  return error;
}

/**
 * `/api/devices`: the device ledger. Every endpoint takes a signed-in session and needs no further permission, so the
 * routes authenticate identity only and leave authorization to the page that calls them.
 */
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const devices = app.container.resolve(deviceServiceToken);

    // A sub-router scoped to `/devices`, so its `*` middleware reaches no other contribution.
    const routes = new Hono();
    routes.onError((error, context) =>
      apiErrorHandler(toDeviceApiError(error), context),
    );
    routes.use('*', auth.required());

    routes.get(
      '/',
      describeRoute({
        tags,
        summary: 'List devices',
        operationId: 'listDevices',
        responses: {
          200: listResponse(DeviceSchema, DevicesListMeta),
          401: apiErrorResponse(401),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('query', ListDevicesQuery),
      async (context) => {
        const { status, page, pageSize } = context.req.valid('query');
        const { data, total } = await devices.list({ status, page, pageSize });
        return context.json({ data, meta: { total, page, pageSize } });
      },
    );

    routes.post(
      '/',
      describeRoute({
        tags,
        summary: 'Add a device',
        operationId: 'createDevice',
        responses: {
          201: dataResponse(DeviceSchema, 'The device that was added.'),
          401: apiErrorResponse(401),
          409: apiErrorResponse(
            409,
            'Another device already holds this code (`DEVICE_CODE_TAKEN`).',
          ),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('json', CreateDeviceInput),
      async (context) => {
        const device = await devices.create(context.req.valid('json'));
        return context.json({ data: device }, 201);
      },
    );

    routes.get(
      '/:deviceId',
      describeRoute({
        tags,
        summary: 'Read a device',
        operationId: 'getDevice',
        responses: {
          200: dataResponse(DeviceSchema, 'The device.'),
          401: apiErrorResponse(401),
          404: apiErrorResponse(
            404,
            'No device has this id (`DEVICE_NOT_FOUND`).',
          ),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('param', DeviceParams),
      async (context) => {
        const device = await devices.get(context.req.valid('param').deviceId);
        return context.json({ data: device });
      },
    );

    routes.patch(
      '/:deviceId',
      describeRoute({
        tags,
        summary: 'Change a device',
        operationId: 'updateDevice',
        responses: {
          200: dataResponse(DeviceSchema, 'The device after the change.'),
          401: apiErrorResponse(401),
          404: apiErrorResponse(
            404,
            'No device has this id (`DEVICE_NOT_FOUND`).',
          ),
          409: apiErrorResponse(
            409,
            'Another device already holds this code (`DEVICE_CODE_TAKEN`).',
          ),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('param', DeviceParams),
      apiValidator('json', UpdateDeviceInput),
      async (context) => {
        const device = await devices.update(
          context.req.valid('param').deviceId,
          context.req.valid('json'),
        );
        return context.json({ data: device });
      },
    );

    router.route('/devices', routes);
    return router;
  },
);

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
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import { z } from 'zod';

import {
  DeviceCodeTakenError,
  DeviceNotFoundError,
  deviceServiceToken,
} from '../providers/devices.js';
import {
  CreateDeviceInput,
  Device,
  DeviceIdParams,
  ListDevicesQuery,
  UpdateDeviceInput,
} from './schemas.js';

const DOMAIN = 'devices';

/** Answers an expected business failure without passing it through the application's 500 logger. */
function respondToDeviceError(error: unknown, context: Context): Response {
  const mapped = deviceError(error);
  if (!(mapped instanceof ApiError)) throw error;
  return apiErrorHandler(mapped, context);
}

function deviceError(error: unknown): unknown {
  if (error instanceof DeviceCodeTakenError) {
    return new ApiError({
      status: 'ALREADY_EXISTS',
      reason: 'DEVICE_CODE_TAKEN',
      domain: DOMAIN,
      message: 'A device with this code already exists.',
    });
  }
  if (error instanceof DeviceNotFoundError) {
    return new ApiError({
      status: 'NOT_FOUND',
      reason: 'DEVICE_NOT_FOUND',
      domain: DOMAIN,
      message: 'The requested device does not exist.',
    });
  }
  return error;
}

export const deviceApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const devices = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const ledger = app.container.resolve(deviceServiceToken);

    // Every device operation requires a session. All signed-in users share the same ledger, so no extra permission
    // check is needed; mounting below /api is not what authenticates these routes.
    devices.use('*', auth.required());

    devices.get(
      '/',
      describeRoute({
        tags: ['Devices'],
        summary: 'List devices',
        operationId: 'listDevices',
        responses: {
          200: dataResponse(z.array(Device), 'The devices in the ledger.'),
          401: apiErrorResponse(401),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('query', ListDevicesQuery),
      async (context) => {
        const { status } = context.req.valid('query');
        try {
          const rows = await ledger.list(
            status === undefined ? {} : { status },
          );
          return context.json({ data: rows });
        } catch (error) {
          return respondToDeviceError(error, context);
        }
      },
    );

    devices.post(
      '/',
      describeRoute({
        tags: ['Devices'],
        summary: 'Add a device',
        operationId: 'createDevice',
        responses: {
          201: dataResponse(Device, 'The created device.'),
          401: apiErrorResponse(401),
          409: apiErrorResponse(
            409,
            'A device with this code already exists (`DEVICE_CODE_TAKEN`).',
          ),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('json', CreateDeviceInput),
      async (context) => {
        try {
          const data = await ledger.create(context.req.valid('json'));
          return context.json({ data }, 201);
        } catch (error) {
          return respondToDeviceError(error, context);
        }
      },
    );

    devices.patch(
      '/:deviceId',
      describeRoute({
        tags: ['Devices'],
        summary: 'Edit a device',
        operationId: 'updateDevice',
        responses: {
          200: dataResponse(Device, 'The updated device.'),
          401: apiErrorResponse(401),
          404: apiErrorResponse(
            404,
            'The device does not exist (`DEVICE_NOT_FOUND`).',
          ),
          409: apiErrorResponse(
            409,
            'A device with this code already exists (`DEVICE_CODE_TAKEN`).',
          ),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('param', DeviceIdParams),
      apiValidator('json', UpdateDeviceInput),
      async (context) => {
        const { deviceId } = context.req.valid('param');
        try {
          const data = await ledger.update(deviceId, context.req.valid('json'));
          return context.json({ data });
        } catch (error) {
          return respondToDeviceError(error, context);
        }
      },
    );

    router.route('/devices', devices);
    router.onError((error, context) =>
      apiErrorHandler(deviceError(error), context),
    );

    return router;
  });

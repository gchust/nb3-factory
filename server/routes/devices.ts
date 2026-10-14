import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
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
  DeviceCodeTakenError,
  DeviceNotFoundError,
  deviceServiceToken,
} from '../providers/devices.js';
import {
  Device,
  DeviceCreateInput,
  DeviceListMeta,
  DeviceListQuery,
  DeviceParams,
  DeviceUpdateInput,
} from './schemas.js';

const tags = ['Devices'];

/** The URL namespace of these routes, and the `domain` of every error they report. */
export const DEVICES_ERROR_DOMAIN = 'devices';

/**
 * Every route is behind the session. The middleware is installed on each route
 * rather than through `router.use('*')`, because every API contribution mounts
 * into one router and a catch-all would run on another contribution's paths.
 */
const unauthenticated = {
  401: apiErrorResponse(401),
  500: apiErrorResponse(500),
} as const;

const deviceNotFoundResponse = apiErrorResponse(
  404,
  'No device with this id exists (`DEVICE_NOT_FOUND`).',
);

const deviceCodeTakenResponse = apiErrorResponse(
  409,
  'Another device already uses this code (`DEVICE_CODE_TAKEN`).',
);

function deviceNotFound(deviceId: string): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'DEVICE_NOT_FOUND',
    domain: DEVICES_ERROR_DOMAIN,
    message: `Device ${deviceId} was not found.`,
  });
}

function deviceCodeTaken(code: string): ApiError {
  return new ApiError({
    status: 'ALREADY_EXISTS',
    reason: 'DEVICE_CODE_TAKEN',
    domain: DEVICES_ERROR_DOMAIN,
    message: `Device code "${code}" is already in use.`,
    fieldViolations: [
      {
        field: 'code',
        description: 'This code is already used by another device.',
      },
    ],
  });
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const { container } = app;
    const router = new Hono();
    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    const deviceService = container.resolve(deviceServiceToken);

    // Translate this router's own errors and hand everything else to the
    // framework's handler, so a router mounted on its own answers the standard
    // error body and rethrows what it does not recognize.
    router.onError((error, context) =>
      apiErrorHandler(
        error instanceof DeviceNotFoundError
          ? deviceNotFound(error.deviceId)
          : error instanceof DeviceCodeTakenError
            ? deviceCodeTaken(error.code)
            : error,
        context,
      ),
    );

    const authenticated = [
      authentication.required(),
      authorization.middleware(),
    ] as const;

    router.get(
      '/devices',
      ...authenticated,
      describeRoute({
        tags,
        summary: 'List devices',
        operationId: 'listDevices',
        description:
          'Every device, ordered by code, optionally only those in one status. Pages by `page` and `pageSize`. Requires a session.',
        responses: {
          200: listResponse(Device, DeviceListMeta),
          ...unauthenticated,
        },
      }),
      apiValidator('query', DeviceListQuery),
      async (context) => {
        const { status, page, pageSize } = context.req.valid('query');
        const { items, total } = await deviceService.list({
          status,
          page,
          pageSize,
        });
        return context.json({ data: items, meta: { page, pageSize, total } });
      },
    );

    router.get(
      '/devices/:deviceId',
      ...authenticated,
      describeRoute({
        tags,
        summary: 'Get a device',
        operationId: 'getDevice',
        description: 'One device by id. Requires a session.',
        responses: {
          200: dataResponse(Device),
          ...unauthenticated,
          404: deviceNotFoundResponse,
        },
      }),
      apiValidator('param', DeviceParams),
      async (context) => {
        const { deviceId } = context.req.valid('param');
        const device = await deviceService.get(deviceId);
        if (!device) {
          throw deviceNotFound(deviceId);
        }
        return context.json({ data: device });
      },
    );

    router.post(
      '/devices',
      ...authenticated,
      describeRoute({
        tags,
        summary: 'Create a device',
        operationId: 'createDevice',
        description:
          'Adds a device. `code` must be unique across all devices. Requires a session.',
        responses: {
          201: dataResponse(Device, 'The created device.'),
          ...unauthenticated,
          409: deviceCodeTakenResponse,
        },
      }),
      apiValidator('json', DeviceCreateInput),
      async (context) => {
        const values = context.req.valid('json');
        return context.json({ data: await deviceService.create(values) }, 201);
      },
    );

    router.patch(
      '/devices/:deviceId',
      ...authenticated,
      describeRoute({
        tags,
        summary: 'Update a device',
        operationId: 'updateDevice',
        description:
          'Changes the given fields of one device and leaves the rest alone. A `code` that another device already uses is refused. Requires a session.',
        responses: {
          200: dataResponse(Device, 'The device after the change.'),
          ...unauthenticated,
          404: deviceNotFoundResponse,
          409: deviceCodeTakenResponse,
        },
      }),
      apiValidator('param', DeviceParams),
      apiValidator('json', DeviceUpdateInput),
      async (context) => {
        const { deviceId } = context.req.valid('param');
        const values = context.req.valid('json');
        return context.json({
          data: await deviceService.update(deviceId, values),
        });
      },
    );

    return router;
  },
);

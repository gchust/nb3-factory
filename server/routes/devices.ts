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
import { Hono, type Context } from 'hono';

import {
  DeviceError,
  deviceServiceToken,
  type DeviceService,
} from '../providers/devices.js';

import {
  CreateDeviceInput,
  CreateDeviceResourceInput,
  DeviceParams,
  DeviceSchema,
  DevicesMeta,
  GetDeviceResourceQuery,
  ListDevicesQuery,
  UpdateDeviceInput,
  UpdateDeviceResourceInput,
} from './schemas.js';

const tags = ['Devices'];

/** A `DeviceError` in the standard API error body. `reason` is what a client branches on. */
function toDeviceApiError(error: DeviceError): ApiError {
  if (error.code === 'DEVICE_NOT_FOUND') {
    return new ApiError({
      status: 'NOT_FOUND',
      reason: 'DEVICE_NOT_FOUND',
      domain: 'app',
      message: error.message,
    });
  }
  return new ApiError({
    status: 'ALREADY_EXISTS',
    reason: 'DEVICE_CODE_TAKEN',
    domain: 'app',
    message: error.message,
  });
}

/** An id is a number or a string; anything else (`null`, an object) is not an id. */
function idText(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string' && value !== '') return value;
  return undefined;
}

/** The id a classic resource request carries instead of a path segment. */
function resourceId(
  filterByTk: string | number | undefined,
  filter: string | Record<string, unknown> | undefined,
): string | undefined {
  if (filterByTk !== undefined) return idText(filterByTk);
  if (filter === undefined) return undefined;
  if (typeof filter === 'string') {
    try {
      const parsed: unknown = JSON.parse(filter);
      if (parsed && typeof parsed === 'object' && 'id' in parsed) {
        return idText((parsed as { id?: unknown }).id);
      }
    } catch {
      return undefined;
    }
    return undefined;
  }
  return idText(filter.id);
}

function missingIdError(): ApiError {
  return new ApiError({
    status: 'INVALID_ARGUMENT',
    reason: 'DEVICE_ID_REQUIRED',
    domain: 'app',
    message: 'A device id is required, as `filterByTk` or `filter.id`.',
  });
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  ({ container }) => {
    const router = new Hono();
    const routes = new Hono();
    const authentication = container.resolve(authenticationToken);
    const devices: DeviceService = container.resolve(deviceServiceToken);

    const handleError = (error: Error, context: Context): Response =>
      apiErrorHandler(
        error instanceof DeviceError ? toDeviceApiError(error) : error,
        context,
      );

    routes.onError(handleError);
    router.onError(handleError);

    // Everything under `/devices` needs a session. `authentication.required()`
    // answers 401 by itself; there is no permission check because any signed-in
    // user may manage devices.
    routes.use('*', authentication.required());
    const session = authentication.required();

    routes.get(
      '/',
      describeRoute({
        tags,
        summary: 'List devices',
        operationId: 'listDevices',
        description:
          'Ordered by code. `status` narrows the list to one of `available` and `borrowed`.',
        responses: {
          200: listResponse(DeviceSchema, DevicesMeta),
          401: apiErrorResponse(401),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('query', ListDevicesQuery),
      async (context) => {
        const { status } = context.req.valid('query');
        const data = await devices.list(status ? { status } : undefined);
        return context.json({ data, meta: { total: data.length } });
      },
    );

    routes.post(
      '/',
      describeRoute({
        tags,
        summary: 'Create a device',
        operationId: 'createDevice',
        responses: {
          201: dataResponse(DeviceSchema),
          401: apiErrorResponse(401),
          409: apiErrorResponse(
            409,
            'The code is already in use (`DEVICE_CODE_TAKEN`).',
          ),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('json', CreateDeviceInput),
      async (context) => {
        const input = context.req.valid('json');
        return context.json({ data: await devices.create(input) }, 201);
      },
    );

    routes.get(
      '/:deviceId',
      describeRoute({
        tags,
        summary: 'Get one device',
        operationId: 'getDevice',
        responses: {
          200: dataResponse(DeviceSchema),
          401: apiErrorResponse(401),
          404: apiErrorResponse(
            404,
            'No device has that id (`DEVICE_NOT_FOUND`).',
          ),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('param', DeviceParams),
      async (context) => {
        const device = await devices.get(context.req.valid('param').deviceId);
        if (!device) {
          throw new DeviceError('DEVICE_NOT_FOUND', 'No device has that id.');
        }
        return context.json({ data: device });
      },
    );

    routes.patch(
      '/:deviceId',
      describeRoute({
        tags,
        summary: 'Update a device',
        operationId: 'updateDevice',
        responses: {
          200: dataResponse(DeviceSchema),
          401: apiErrorResponse(401),
          404: apiErrorResponse(
            404,
            'No device has that id (`DEVICE_NOT_FOUND`).',
          ),
          409: apiErrorResponse(
            409,
            'The code is already in use (`DEVICE_CODE_TAKEN`).',
          ),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('param', DeviceParams),
      apiValidator('json', UpdateDeviceInput),
      async (context) => {
        const { deviceId } = context.req.valid('param');
        const changes = context.req.valid('json');
        return context.json({ data: await devices.update(deviceId, changes) });
      },
    );

    // The classic NocoBase resource-action paths, `/api/devices:list` and
    // friends. Hono treats a `:` inside a segment as a literal, so these are
    // separate paths from `/devices/:deviceId` and need their own session
    // check: the sub-router above is mounted at `/devices` and does not see
    // them. They answer exactly what the REST routes answer.
    router.get(
      '/devices:list',
      session,
      describeRoute({
        tags,
        summary: 'List devices (resource action)',
        operationId: 'listDevicesResource',
        description:
          'The classic resource-action form of `GET /api/devices`, for integrations that expect `/api/devices:list`.',
        responses: {
          200: listResponse(DeviceSchema, DevicesMeta),
          401: apiErrorResponse(401),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('query', ListDevicesQuery),
      async (context) => {
        const { status } = context.req.valid('query');
        const data = await devices.list(status ? { status } : undefined);
        return context.json({ data, meta: { total: data.length } });
      },
    );

    router.post(
      '/devices:create',
      session,
      describeRoute({
        tags,
        summary: 'Create a device (resource action)',
        operationId: 'createDeviceResource',
        description:
          'The classic resource-action form of `POST /api/devices`. The values may sit at the top level or under `values`.',
        responses: {
          201: dataResponse(DeviceSchema),
          401: apiErrorResponse(401),
          409: apiErrorResponse(
            409,
            'The code is already in use (`DEVICE_CODE_TAKEN`).',
          ),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('json', CreateDeviceResourceInput),
      async (context) => {
        const body = context.req.valid('json');
        const input = 'values' in body ? body.values : body;
        return context.json({ data: await devices.create(input) }, 201);
      },
    );

    router.get(
      '/devices:get',
      session,
      describeRoute({
        tags,
        summary: 'Get one device (resource action)',
        operationId: 'getDeviceResource',
        description:
          'The classic resource-action form of `GET /api/devices/:deviceId`. The id is `filterByTk` or `filter.id`.',
        responses: {
          200: dataResponse(DeviceSchema),
          401: apiErrorResponse(401),
          404: apiErrorResponse(
            404,
            'No device has that id (`DEVICE_NOT_FOUND`).',
          ),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('query', GetDeviceResourceQuery),
      async (context) => {
        const { filterByTk, filter } = context.req.valid('query');
        const id = resourceId(filterByTk, filter);
        if (id === undefined) throw missingIdError();
        const device = await devices.get(id);
        if (!device) {
          throw new DeviceError('DEVICE_NOT_FOUND', 'No device has that id.');
        }
        return context.json({ data: device });
      },
    );

    router.post(
      '/devices:update',
      session,
      describeRoute({
        tags,
        summary: 'Update a device (resource action)',
        operationId: 'updateDeviceResource',
        description:
          'The classic resource-action form of `PATCH /api/devices/:deviceId`. The values sit under `values` and the id in `filter.id` or `filterByTk`.',
        responses: {
          200: dataResponse(DeviceSchema),
          401: apiErrorResponse(401),
          404: apiErrorResponse(
            404,
            'No device has that id (`DEVICE_NOT_FOUND`).',
          ),
          409: apiErrorResponse(
            409,
            'The code is already in use (`DEVICE_CODE_TAKEN`).',
          ),
          500: apiErrorResponse(500),
        },
      }),
      apiValidator('json', UpdateDeviceResourceInput),
      async (context) => {
        const { filter, filterByTk, values } = context.req.valid('json');
        const id = resourceId(filterByTk, filter);
        if (id === undefined) throw missingIdError();
        return context.json({ data: await devices.update(id, values) });
      },
    );

    router.route('/devices', routes);

    return router;
  },
);

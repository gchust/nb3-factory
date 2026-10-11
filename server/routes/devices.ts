import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
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
import { Hono } from 'hono';

import {
  DeviceCodeTakenError,
  DeviceNotFoundError,
  deviceServiceToken,
} from '../providers/devices.js';
import {
  CreateDeviceInput,
  DeviceListMetaSchema,
  DeviceParams,
  DeviceSchema,
  ListDevicesQuery,
  UpdateDeviceInput,
} from './schemas.js';

/**
 * Translate the service's domain errors into the API's standard error body. The service throws these; the route, and
 * only the route, decides the HTTP status and the reason a client branches on.
 */
function rethrowAsApiError(error: unknown): never {
  if (error instanceof DeviceNotFoundError) {
    throw new ApiError({
      status: 'NOT_FOUND',
      reason: 'DEVICE_NOT_FOUND',
      domain: 'devices',
      message: `No device has id "${error.deviceId}".`,
    });
  }
  if (error instanceof DeviceCodeTakenError) {
    throw new ApiError({
      status: 'ALREADY_EXISTS',
      reason: 'DEVICE_CODE_TAKEN',
      domain: 'devices',
      message: `A device with code "${error.deviceCode}" already exists.`,
      // Points the client at the field to explain, so a form can show the message next to "code".
      fieldViolations: [
        {
          field: 'code',
          description: `The code "${error.deviceCode}" is already in use.`,
          reason: 'DEVICE_CODE_TAKEN',
        },
      ],
    });
  }
  throw error;
}

/** The device ledger's REST endpoints: list, read, create and update. */
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const devices = app.container.resolve(deviceServiceToken);

    // Every path this contribution owns. `use` with a bare path matches that path; `/*` covers its children.
    router.use('/devices', auth.required());
    router.use('/devices/*', auth.required());

    router.get(
      '/devices',
      describeRoute({
        tags: ['Devices'],
        summary: 'List devices',
        operationId: 'listDevices',
        responses: {
          '200': listResponse(DeviceSchema, DeviceListMetaSchema),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('query', ListDevicesQuery),
      async (context) => {
        const query = context.req.valid('query');
        const result = await devices.list(query);
        return context.json({ data: [...result.data], meta: result.meta });
      },
    );

    router.get(
      '/devices/:deviceId',
      describeRoute({
        tags: ['Devices'],
        summary: 'Get a device',
        operationId: 'getDevice',
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
        try {
          return context.json({ data: await devices.get(deviceId) });
        } catch (error) {
          rethrowAsApiError(error);
        }
      },
    );

    router.post(
      '/devices',
      describeRoute({
        tags: ['Devices'],
        summary: 'Create a device',
        operationId: 'createDevice',
        responses: {
          '201': dataResponse(DeviceSchema, 'The created device.'),
          '401': apiErrorResponse(401),
          '409': apiErrorResponse(
            409,
            'The code is already used by another device (`DEVICE_CODE_TAKEN`).',
          ),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('json', CreateDeviceInput),
      async (context) => {
        try {
          const device = await devices.create(context.req.valid('json'));
          return context.json({ data: device }, 201);
        } catch (error) {
          rethrowAsApiError(error);
        }
      },
    );

    router.patch(
      '/devices/:deviceId',
      describeRoute({
        tags: ['Devices'],
        summary: 'Update a device',
        operationId: 'updateDevice',
        responses: {
          '200': dataResponse(DeviceSchema, 'The updated device.'),
          '401': apiErrorResponse(401),
          '404': apiErrorResponse(404),
          '409': apiErrorResponse(
            409,
            'The code is already used by another device (`DEVICE_CODE_TAKEN`).',
          ),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('param', DeviceParams),
      apiValidator('json', UpdateDeviceInput),
      async (context) => {
        const { deviceId } = context.req.valid('param');
        try {
          const device = await devices.update(
            deviceId,
            context.req.valid('json'),
          );
          return context.json({ data: device });
        } catch (error) {
          rethrowAsApiError(error);
        }
      },
    );

    return router;
  },
);

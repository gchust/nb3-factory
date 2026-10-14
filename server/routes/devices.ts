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

import { deviceServiceToken } from '../providers/devices.js';
import {
  CreateDeviceInput,
  DeviceListMeta,
  DeviceListQuery,
  DeviceParams,
  DeviceSchema,
  UpdateDeviceInput,
} from './schemas.js';

const tags = ['Devices'];

/**
 * The device ledger's HTTP surface. Mounted under `/api`, and the factory resolves its dependencies from the
 * application container — the service holds the domain logic, these handlers only translate HTTP to it.
 */
export const devicesApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const devices = app.container.resolve(deviceServiceToken);

    // Every path this contribution owns is authenticated on its own; nothing depends on another route's middleware.
    router.use('/devices', auth.required());

    router.get(
      '/devices',
      describeRoute({
        tags,
        summary: 'List devices',
        operationId: 'listDevices',
        responses: {
          '200': listResponse(DeviceSchema, DeviceListMeta),
          // Requires a session but checks no permission, so it lists its own statuses rather than apiErrorResponses.
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('query', DeviceListQuery),
      async (context) => {
        const { status, page, pageSize } = context.req.valid('query');
        const result = await devices.list({ status, page, pageSize });
        return context.json({
          data: result.data,
          meta: {
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
          },
        });
      },
    );

    router.get(
      '/devices/:deviceId',
      describeRoute({
        tags,
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
        const device = await devices.findById(deviceId);
        if (!device) {
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'DEVICE_NOT_FOUND',
            domain: 'devices',
            message: 'No device has this id.',
          });
        }
        return context.json({ data: device });
      },
    );

    router.post(
      '/devices',
      describeRoute({
        tags,
        summary: 'Create a device',
        operationId: 'createDevice',
        responses: {
          '201': dataResponse(DeviceSchema, 'The created device.'),
          '401': apiErrorResponse(401),
          '409': apiErrorResponse(
            409,
            'A device already uses this reference (`DEVICE_REFERENCE_TAKEN`).',
          ),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('json', CreateDeviceInput),
      async (context) => {
        const input = context.req.valid('json');
        if (await devices.referenceExists(input.reference)) {
          throw new ApiError({
            status: 'ALREADY_EXISTS',
            reason: 'DEVICE_REFERENCE_TAKEN',
            domain: 'devices',
            message: 'A device already uses this reference.',
          });
        }
        const device = await devices.create({
          reference: input.reference,
          name: input.name,
          status: input.status,
          remark: input.remark ?? null,
        });
        return context.json({ data: device }, 201);
      },
    );

    router.patch(
      '/devices/:deviceId',
      describeRoute({
        tags,
        summary: 'Update a device',
        operationId: 'updateDevice',
        responses: {
          '200': dataResponse(DeviceSchema, 'The updated device.'),
          '401': apiErrorResponse(401),
          '404': apiErrorResponse(404),
          '409': apiErrorResponse(
            409,
            'Another device already uses this reference (`DEVICE_REFERENCE_TAKEN`).',
          ),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('param', DeviceParams),
      apiValidator('json', UpdateDeviceInput),
      async (context) => {
        const { deviceId } = context.req.valid('param');
        const input = context.req.valid('json');
        if (
          input.reference !== undefined &&
          (await devices.referenceExists(input.reference, deviceId))
        ) {
          throw new ApiError({
            status: 'ALREADY_EXISTS',
            reason: 'DEVICE_REFERENCE_TAKEN',
            domain: 'devices',
            message: 'Another device already uses this reference.',
          });
        }
        const device = await devices.update(deviceId, input);
        if (!device) {
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'DEVICE_NOT_FOUND',
            domain: 'devices',
            message: 'No device has this id.',
          });
        }
        return context.json({ data: device });
      },
    );

    return router;
  });

export default devicesApiRoutes;

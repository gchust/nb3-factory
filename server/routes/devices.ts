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
import { z } from 'zod';

import {
  DEVICE_STATUSES,
  DeviceCodeTakenError,
  DeviceNotFoundError,
  deviceServiceToken,
} from '../providers/devices.js';

const DEVICE_DOMAIN = 'devices';

const DeviceStatusSchema = z.enum(DEVICE_STATUSES);

const DeviceSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  status: DeviceStatusSchema,
});

const DeviceListMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

const ListDevicesQuerySchema = z.object({
  status: DeviceStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const DeviceParamsSchema = z.object({
  deviceId: z.string().min(1).max(64),
});

const CreateDeviceInputSchema = z.strictObject({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(100),
  status: DeviceStatusSchema.default('available'),
});

const UpdateDeviceInputSchema = z
  .strictObject({
    code: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(100).optional(),
    status: DeviceStatusSchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Provide at least one field to update.',
  });

function codeTaken(): ApiError {
  return new ApiError({
    status: 'ALREADY_EXISTS',
    reason: 'DEVICE_CODE_TAKEN',
    domain: DEVICE_DOMAIN,
    message: 'A device with this code already exists.',
  });
}

function deviceNotFound(): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'DEVICE_NOT_FOUND',
    domain: DEVICE_DOMAIN,
    message: 'The device does not exist.',
  });
}

export const deviceApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const devices = app.container.resolve(deviceServiceToken);

    // Every device endpoint needs a session, and this sub-router owns nothing
    // mounted outside `/devices`.
    routes.use('*', auth.required());

    routes.get(
      '/',
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
      apiValidator('query', ListDevicesQuerySchema),
      async (context) => {
        const { status, page, pageSize } = context.req.valid('query');
        const result = await devices.list({ status, page, pageSize });
        return context.json({
          data: result.rows,
          meta: { page, pageSize, total: result.total },
        });
      },
    );

    routes.get(
      '/:deviceId',
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
      apiValidator('param', DeviceParamsSchema),
      async (context) => {
        const { deviceId } = context.req.valid('param');
        const device = await devices.get(deviceId);
        if (!device) {
          throw deviceNotFound();
        }
        return context.json({ data: device });
      },
    );

    routes.post(
      '/',
      describeRoute({
        tags: ['Devices'],
        summary: 'Add a device',
        operationId: 'createDevice',
        responses: {
          '201': dataResponse(DeviceSchema, 'The device was added.'),
          '401': apiErrorResponse(401),
          '409': apiErrorResponse(409),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('json', CreateDeviceInputSchema),
      async (context) => {
        const input = context.req.valid('json');
        try {
          const device = await devices.create(input);
          return context.json({ data: device }, 201);
        } catch (error) {
          if (error instanceof DeviceCodeTakenError) {
            throw codeTaken();
          }
          throw error;
        }
      },
    );

    routes.patch(
      '/:deviceId',
      describeRoute({
        tags: ['Devices'],
        summary: 'Edit a device',
        operationId: 'updateDevice',
        responses: {
          '200': dataResponse(DeviceSchema, 'The device was updated.'),
          '401': apiErrorResponse(401),
          '404': apiErrorResponse(404),
          '409': apiErrorResponse(409),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('param', DeviceParamsSchema),
      apiValidator('json', UpdateDeviceInputSchema),
      async (context) => {
        const { deviceId } = context.req.valid('param');
        const input = context.req.valid('json');
        try {
          const device = await devices.update(deviceId, input);
          return context.json({ data: device });
        } catch (error) {
          if (error instanceof DeviceCodeTakenError) {
            throw codeTaken();
          }
          if (error instanceof DeviceNotFoundError) {
            throw deviceNotFound();
          }
          throw error;
        }
      },
    );

    router.route('/devices', routes);
    return router;
  });

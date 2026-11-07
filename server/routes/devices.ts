import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiErrorStatusFromHttp,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  APP_NS,
  getRequestLocale,
  TRANSLATOR_CONTEXT_KEY,
  type Translator,
} from '@nocobase/i18n/server';
import { Hono, type Context } from 'hono';
import { z } from 'zod';

import {
  DEVICE_STATUSES,
  DuplicateDeviceCodeError,
  deviceServiceToken,
  type DeviceRecord,
} from '../providers/devices.js';

export const DeviceSchema: z.ZodType<DeviceRecord> = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    status: z.enum(DEVICE_STATUSES),
    notes: z.string().nullable(),
  })
  .meta({ ref: 'Device' });

export const DeviceParams = z.object({
  deviceId: z.string().trim().min(1).max(64),
});

export const ListDevicesQuery = z.object({
  status: z.enum(DEVICE_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const CreateDeviceInput = z.strictObject({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(100),
  status: z.enum(DEVICE_STATUSES).default('available'),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const UpdateDeviceInput = z
  .strictObject({
    code: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(100).optional(),
    status: z.enum(DEVICE_STATUSES).optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: 'At least one field is required.',
    },
  );

/**
 * The standard error body, with the user-facing text already translated into the request's language. The `reason`
 * stays a stable code the client branches on; `localizedMessage` is what it may show.
 */
function deviceApiError(
  context: Context,
  options: {
    status: number;
    reason: string;
    message: string;
    key: string;
    params?: Record<string, unknown>;
  },
): ApiError {
  const locale = getRequestLocale(context);
  // Read rather than `getRequestTranslator()`, which throws without the i18n middleware: an error must still render.
  const translator = context.get(TRANSLATOR_CONTEXT_KEY) as
    Translator | undefined;
  const localizedMessage =
    locale && translator
      ? {
          locale,
          message: translator(options.key, {
            ns: APP_NS,
            ...options.params,
          }),
        }
      : undefined;
  return new ApiError({
    status: apiErrorStatusFromHttp(options.status),
    reason: options.reason,
    domain: 'devices',
    message: options.message,
    ...(localizedMessage ? { localizedMessage } : {}),
    ...(options.params ? { metadata: options.params } : {}),
  });
}

function codeTaken(context: Context, code: string): ApiError {
  return deviceApiError(context, {
    status: 409,
    reason: 'DEVICE_CODE_TAKEN',
    message: 'Another device already uses this code.',
    key: 'devices.errors.codeTaken',
    params: { code },
  });
}

function deviceNotFound(context: Context): ApiError {
  return deviceApiError(context, {
    status: 404,
    reason: 'DEVICE_NOT_FOUND',
    message: 'No device has this id.',
    key: 'devices.errors.notFound',
  });
}

function translateDomainError(context: Context, error: unknown): unknown {
  return error instanceof DuplicateDeviceCodeError
    ? codeTaken(context, error.code)
    : error;
}

export const deviceApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const devices = app.container.resolve(deviceServiceToken);

    // Every endpoint is for signed-in people; there is no finer permission for the ledger.
    routes.use('*', auth.required());

    routes.get(
      '/',
      describeRoute({
        tags: ['Devices'],
        summary: 'List devices',
        operationId: 'listDevices',
        responses: {
          '200': listResponse(DeviceSchema),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('query', ListDevicesQuery),
      async (context) => {
        const { status, page, pageSize } = context.req.valid('query');
        const result = await devices.list({ status, page, pageSize });
        return context.json({
          data: result.rows,
          meta: { page, pageSize, total: result.total },
        });
      },
    );

    routes.post(
      '/',
      describeRoute({
        tags: ['Devices'],
        summary: 'Add a device',
        operationId: 'createDevice',
        responses: {
          '201': dataResponse(DeviceSchema, 'The device that was added.'),
          '401': apiErrorResponse(401),
          '409': apiErrorResponse(409, 'Another device already uses the code.'),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('json', CreateDeviceInput),
      async (context) => {
        const input = context.req.valid('json');
        try {
          const device = await devices.create(input);
          return context.json({ data: device }, 201);
        } catch (error) {
          throw translateDomainError(context, error);
        }
      },
    );

    routes.get(
      '/:deviceId',
      describeRoute({
        tags: ['Devices'],
        summary: 'Get a device',
        operationId: 'getDevice',
        responses: {
          '200': dataResponse(DeviceSchema, 'The requested device.'),
          '401': apiErrorResponse(401),
          '404': apiErrorResponse(404, 'No device has this id.'),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('param', DeviceParams),
      async (context) => {
        const { deviceId } = context.req.valid('param');
        const device = await devices.get(deviceId);
        if (!device) {
          throw deviceNotFound(context);
        }
        return context.json({ data: device });
      },
    );

    routes.patch(
      '/:deviceId',
      describeRoute({
        tags: ['Devices'],
        summary: 'Edit a device',
        operationId: 'updateDevice',
        responses: {
          '200': dataResponse(DeviceSchema, 'The edited device.'),
          '401': apiErrorResponse(401),
          '404': apiErrorResponse(404, 'No device has this id.'),
          '409': apiErrorResponse(409, 'Another device already uses the code.'),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('param', DeviceParams),
      apiValidator('json', UpdateDeviceInput),
      async (context) => {
        const { deviceId } = context.req.valid('param');
        const input = context.req.valid('json');
        try {
          const device = await devices.update(deviceId, input);
          if (!device) {
            throw deviceNotFound(context);
          }
          return context.json({ data: device });
        } catch (error) {
          throw translateDomainError(context, error);
        }
      },
    );

    router.route('/devices', routes);
    return router;
  });

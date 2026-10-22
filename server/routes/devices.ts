import { getRequestLocale, getRequestTranslator } from '@nocobase/i18n/server';
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
import { Hono, type Context } from 'hono';
import { z } from 'zod';

import {
  DEVICE_STATUSES,
  DeviceError,
  devicesServiceToken,
} from '../providers/index.js';

const DeviceStatusSchema = z.enum(DEVICE_STATUSES);

/** The record the API returns; nothing validates a response against it, it documents the shape. */
export const DeviceSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  status: DeviceStatusSchema,
  notes: z.string().nullable(),
});

/** Loose, because a query is a string map: unknown keys are ignored rather than refused. */
const ListDevicesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: DeviceStatusSchema.optional(),
});

/** Strict, so a misspelled field is a 400 instead of a silent no-op. */
const CreateDeviceInput = z.strictObject({
  code: z.string().trim().min(1).max(64).describe('The unique device code.'),
  name: z.string().trim().min(1).max(255).describe('The device name.'),
  status: DeviceStatusSchema.default('available').describe('Availability.'),
  notes: z.string().max(2000).nullish().describe('Optional notes.'),
});

const UpdateDeviceInput = z.strictObject({
  code: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  status: DeviceStatusSchema.optional(),
  notes: z.string().max(2000).nullish(),
});

const DeviceParams = z.object({
  deviceId: z.string().min(1).describe('The device identifier.'),
});

/**
 * A failure the caller can repair, answered in the standard error body with a stable `reason` a client branches on.
 * `message` is for a developer reading a log; `localizedMessage` carries the wording for the request's language.
 */
function deviceError(
  context: Context,
  options: {
    status: 'NOT_FOUND' | 'ALREADY_EXISTS';
    reason: string;
    message: string;
    key: string;
    variables?: Record<string, unknown>;
  },
): ApiError {
  let localizedMessage;
  try {
    localizedMessage = {
      locale: getRequestLocale(context) ?? 'en-US',
      message: getRequestTranslator(context)(options.key, options.variables),
    };
  } catch {
    // The i18n middleware always runs before an /api route; without it the error still has its reason and message.
    localizedMessage = undefined;
  }
  return new ApiError({
    status: options.status,
    reason: options.reason,
    domain: 'devices',
    message: options.message,
    localizedMessage,
  });
}

export const devicesApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const devices = app.container.resolve(devicesServiceToken);

    // Every signed-in user may read and edit the ledger, so the route requires a session and checks no permission.
    router.use('/devices', auth.required());

    router.get(
      '/devices',
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
        const { page, pageSize, status } = context.req.valid('query');
        const { rows, total } = await devices.list({ page, pageSize, status });
        return context.json({ data: rows, meta: { page, pageSize, total } });
      },
    );

    router.post(
      '/devices',
      describeRoute({
        tags: ['Devices'],
        summary: 'Create a device',
        operationId: 'createDevice',
        responses: {
          '201': dataResponse(DeviceSchema, 'The device was created.'),
          '401': apiErrorResponse(401),
          '409': apiErrorResponse(
            409,
            'A device with this code already exists.',
          ),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('json', CreateDeviceInput),
      async (context) => {
        const input = context.req.valid('json');
        try {
          const device = await devices.create({
            code: input.code,
            name: input.name,
            status: input.status,
            notes: input.notes ?? null,
          });
          return context.json({ data: device }, 201);
        } catch (error) {
          if (
            error instanceof DeviceError &&
            error.code === 'DEVICE_CODE_TAKEN'
          )
            throw deviceError(context, {
              status: 'ALREADY_EXISTS',
              reason: 'DEVICE_CODE_TAKEN',
              message: error.message,
              key: 'devices.errors.codeTaken',
              variables: { code: input.code },
            });
          throw error;
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
          '404': apiErrorResponse(404, 'No device has this identifier.'),
          '409': apiErrorResponse(409, 'Another device already has this code.'),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('param', DeviceParams),
      apiValidator('json', UpdateDeviceInput),
      async (context) => {
        const { deviceId } = context.req.valid('param');
        const input = context.req.valid('json');
        try {
          const device = await devices.update(deviceId, {
            ...(input.code !== undefined ? { code: input.code } : {}),
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
          });
          return context.json({ data: device });
        } catch (error) {
          if (error instanceof DeviceError) {
            if (error.code === 'DEVICE_NOT_FOUND')
              throw deviceError(context, {
                status: 'NOT_FOUND',
                reason: 'DEVICE_NOT_FOUND',
                message: error.message,
                key: 'devices.errors.notFound',
              });
            if (error.code === 'DEVICE_CODE_TAKEN')
              throw deviceError(context, {
                status: 'ALREADY_EXISTS',
                reason: 'DEVICE_CODE_TAKEN',
                message: error.message,
                key: 'devices.errors.codeTaken',
                variables: { code: input.code ?? '' },
              });
          }
          throw error;
        }
      },
    );

    return router;
  });

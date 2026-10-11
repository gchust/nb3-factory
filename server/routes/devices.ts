import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type ApiErrorStatus,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { getRequestLocale, getRequestTranslator } from '@nocobase/i18n/server';
import { Hono, type Context } from 'hono';

import {
  DeviceCodeTakenError,
  DeviceNotFoundError,
  deviceServiceToken,
} from '../providers/devices.js';
import {
  CreateDeviceInput,
  DeviceListQuery,
  DeviceParams,
  DeviceSchema,
  UpdateDeviceInput,
} from './schemas.js';

/** The error domain this feature reports; clients branch on `reason` within it. */
const DEVICE_ERROR_DOMAIN = 'devices';

/**
 * A failure the ledger answers with. The message is developer-facing English; the translator turns the key into text
 * in the language the request asked for, so a user sees a sentence rather than an internal code.
 */
function deviceApiError(
  context: Context,
  options: {
    readonly status: ApiErrorStatus;
    readonly reason: string;
    readonly message: string;
    readonly key: string;
  },
): ApiError {
  const translator = getRequestTranslator(context);
  return new ApiError({
    status: options.status,
    reason: options.reason,
    domain: DEVICE_ERROR_DOMAIN,
    message: options.message,
    localizedMessage: {
      locale: getRequestLocale(context) ?? 'en-US',
      message: translator(options.key),
    },
  });
}

function deviceNotFound(context: Context, id: number): ApiError {
  return deviceApiError(context, {
    status: 'NOT_FOUND',
    reason: 'DEVICE_NOT_FOUND',
    message: `Device ${id} does not exist.`,
    key: 'devices.errors.notFound',
  });
}

function deviceCodeTaken(context: Context): ApiError {
  return deviceApiError(context, {
    status: 'ALREADY_EXISTS',
    reason: 'DEVICE_CODE_TAKEN',
    message: 'A device with this code already exists.',
    key: 'devices.errors.codeTaken',
  });
}

export const deviceApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app: Application) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);

    // The ledger is open to every signed-in user: identity is required, no permission set is checked.
    router.use('/devices', auth.required());
    router.use('/devices/:deviceId', auth.required());

    router.get(
      '/devices',
      describeRoute({
        tags: ['Devices'],
        summary: 'List the devices in the ledger',
        operationId: 'listDevices',
        responses: {
          '200': listResponse(DeviceSchema, undefined, 'The devices.'),
          '401': apiErrorResponse(401),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('query', DeviceListQuery),
      async (context) => {
        const service = app.container.resolve(deviceServiceToken);
        const { status } = context.req.valid('query');
        const data = await service.list(status ? { status } : {});
        return context.json({ data, meta: { total: data.length } });
      },
    );

    router.post(
      '/devices',
      describeRoute({
        tags: ['Devices'],
        summary: 'Add a device to the ledger',
        operationId: 'createDevice',
        responses: {
          '201': dataResponse(DeviceSchema, 'The device that was added.'),
          '401': apiErrorResponse(401),
          '409': apiErrorResponse(
            409,
            'A device already uses this code (`DEVICE_CODE_TAKEN`).',
          ),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('json', CreateDeviceInput),
      async (context) => {
        const service = app.container.resolve(deviceServiceToken);
        const input = context.req.valid('json');
        try {
          const data = await service.create(input);
          return context.json({ data }, 201);
        } catch (error) {
          if (error instanceof DeviceCodeTakenError) {
            throw deviceCodeTaken(context);
          }
          throw error;
        }
      },
    );

    router.get(
      '/devices/:deviceId',
      describeRoute({
        tags: ['Devices'],
        summary: 'Read one device',
        operationId: 'getDevice',
        responses: {
          '200': dataResponse(DeviceSchema, 'The device.'),
          '401': apiErrorResponse(401),
          '404': apiErrorResponse(404),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('param', DeviceParams),
      async (context) => {
        const service = app.container.resolve(deviceServiceToken);
        const { deviceId } = context.req.valid('param');
        const data = await service.find(deviceId);
        if (!data) throw deviceNotFound(context, deviceId);
        return context.json({ data });
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
            'Another device already uses this code (`DEVICE_CODE_TAKEN`).',
          ),
          '500': apiErrorResponse(500),
        },
      }),
      apiValidator('param', DeviceParams),
      apiValidator('json', UpdateDeviceInput),
      async (context) => {
        const service = app.container.resolve(deviceServiceToken);
        const { deviceId } = context.req.valid('param');
        const changes = context.req.valid('json');
        try {
          const data = await service.update(deviceId, changes);
          return context.json({ data });
        } catch (error) {
          if (error instanceof DeviceNotFoundError) {
            throw deviceNotFound(context, deviceId);
          }
          if (error instanceof DeviceCodeTakenError) {
            throw deviceCodeTaken(context);
          }
          throw error;
        }
      },
    );

    return router;
  });

export default deviceApiRoutes;

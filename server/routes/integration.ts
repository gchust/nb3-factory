import {
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  describeRoute,
} from '@nocobase/app-server/router';

import { autoAcceptOrder } from '../services/acceptance.js';
import { findDeviceEvent, submitDeviceEvent } from '../services/integration.js';
import {
  deviceEventInput,
  deviceEventResultSchema,
  eventParam,
} from './schemas.js';
import {
  data,
  requestContext,
  type ServiceHttpServices,
  type ServiceRouter,
} from './support.js';

/**
 * The device platform's entry point.
 *
 * A platform calls these paths with an API key instead of a browser session, so
 * the session middleware accepts either. The key's user still needs the
 * `service.integration.submit` permission: an authenticated key without it is
 * answered `403`, not silently accepted.
 */
export function registerIntegrationRoutes(
  router: ServiceRouter,
  services: ServiceHttpServices,
): void {
  router.post(
    '/integration/deviceEvents',
    describeRoute({
      tags: ['Device platform integration'],
      summary: 'Deliver a device event and create (or find) its service order',
      operationId: 'submitDeviceEvent',
      // The platform holds an API key, not a browser session, so the route
      // declares no security requirement of its own.
      security: [],
      responses: {
        '200': dataResponse(deviceEventResultSchema),
        '404': apiErrorResponse(
          404,
          'No device is registered with the given code.',
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', deviceEventInput),
    async (context) => {
      const serviceContext = requestContext(services, context);
      const result = await submitDeviceEvent(
        serviceContext,
        context.req.valid('json'),
      );
      if (!result.created) {
        return data(context, result);
      }
      // A platform event that produced a new order is accepted automatically,
      // except for a confidential order, which stays pending for a supervisor.
      const accepted = await autoAcceptOrder(serviceContext, result.order.id);
      return data(context, {
        order: accepted.order ?? result.order,
        created: true,
        externalEventId: result.externalEventId,
      });
    },
  );

  router.get(
    '/integration/events/:externalEventId',
    describeRoute({
      tags: ['Device platform integration'],
      summary: 'Read the service order a delivered platform event produced',
      operationId: 'getDeviceEvent',
      security: [],
      responses: {
        '200': dataResponse(deviceEventResultSchema),
        '404': apiErrorResponse(404, 'No order was created for this event id.'),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', eventParam),
    async (context) => {
      const result = await findDeviceEvent(
        requestContext(services, context),
        context.req.valid('param').externalEventId,
      );
      return data(context, { ...result, created: false });
    },
  );
}

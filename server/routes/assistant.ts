import {
  apiErrorResponse,
  apiErrorResponses,
  dataResponse,
  describeRoute,
} from '@nocobase/app-server/router';

import { ServiceError } from '../services/errors.js';
import { assistantStatusSchema } from './schemas.js';
import {
  data,
  type ServiceHttpServices,
  type ServiceRouter,
} from './support.js';

/**
 * The state of the AI service assistant, as the deployment really is.
 *
 * The requirement asked for an AI employee that answers service questions. The
 * employee and its order-lookup tool are registered on the server, and this
 * endpoint reports whether they are — together with how many chat model
 * services the configuration carries. It deliberately does not report a chat
 * as available: this application ships no chat surface, so the answer is read
 * for diagnostics, not used to fake a conversation.
 */
export function registerAssistantRoutes(
  router: ServiceRouter,
  services: ServiceHttpServices,
): void {
  router.get(
    '/serviceAssistant/status',
    describeRoute({
      tags: ['Service assistant'],
      summary: 'Report the registration state of the AI service assistant',
      operationId: 'getServiceAssistantStatus',
      responses: {
        '200': dataResponse(assistantStatusSchema),
        '503': apiErrorResponse(
          503,
          'The assistant status service is not registered in this application.',
        ),
        ...apiErrorResponses,
      },
    }),
    async (context) => {
      if (!services.assistant) {
        throw new ServiceError(
          'UNAVAILABLE',
          'ASSISTANT_STATUS_UNAVAILABLE',
          'The assistant status service is not registered.',
        );
      }
      return data(context, await services.assistant.describe());
    },
  );
}

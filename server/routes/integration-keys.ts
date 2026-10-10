import { ApiKeyService } from '@nocobase/app-plugin-api-keys/server';
import {
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  describeRoute,
  listResponse,
} from '@nocobase/app-server/router';

import {
  createIntegrationKey,
  listIntegrationKeys,
  revokeIntegrationKey,
} from '../services/integration-keys.js';
import {
  createIntegrationKeyInput,
  createdIntegrationKeySchema,
  integrationKeyParam,
  integrationKeySchema,
  removalResultSchema,
} from './schemas.js';
import {
  data,
  requestContext,
  type ServiceHttpServices,
  type ServiceRouter,
} from './support.js';

/**
 * API keys for the external platform's machine account.
 *
 * The keys belong to the user holding the `service.integrator` permission set,
 * which has no pages and cannot manage its own keys. These paths are therefore
 * authorized by the same `page:service.integrationKeys` grant that shows the
 * settings page, which carries no business data grants; the owning account is
 * resolved from the permission-set assignment inside the service rather than
 * from a configured name. The secret is returned once, on creation; only a hash
 * is stored.
 */
export function registerIntegrationKeyRoutes(
  router: ServiceRouter,
  services: ServiceHttpServices,
): void {
  const apiKeys = new ApiKeyService(services.auth, 'default');

  router.get(
    '/integration/keys',
    describeRoute({
      tags: ['Device platform integration'],
      summary: 'List the integration account API keys',
      operationId: 'listIntegrationKeys',
      responses: {
        '200': listResponse(integrationKeySchema),
        ...apiErrorResponses,
      },
    }),
    async (context) =>
      data(
        context,
        await listIntegrationKeys(requestContext(services, context)),
      ),
  );

  router.post(
    '/integration/keys',
    describeRoute({
      tags: ['Device platform integration'],
      summary: 'Issue an API key for the integration account',
      operationId: 'createIntegrationKey',
      responses: {
        '200': dataResponse(createdIntegrationKeySchema),
        '404': apiErrorResponse(
          404,
          'No user is assigned the service.integrator permission set (`INTEGRATION_USER_NOT_FOUND`).',
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('json', createIntegrationKeyInput),
    async (context) =>
      data(
        context,
        await createIntegrationKey(
          requestContext(services, context),
          apiKeys,
          context.req.valid('json'),
        ),
      ),
  );

  router.delete(
    '/integration/keys/:keyId',
    describeRoute({
      tags: ['Device platform integration'],
      summary: 'Revoke an integration account API key',
      operationId: 'revokeIntegrationKey',
      responses: {
        '200': dataResponse(removalResultSchema),
        '404': apiErrorResponse(
          404,
          'The key does not belong to the integration account (`INTEGRATION_KEY_NOT_FOUND`).',
        ),
        ...apiErrorResponses,
      },
    }),
    apiValidator('param', integrationKeyParam),
    async (context) => {
      await revokeIntegrationKey(
        requestContext(services, context),
        apiKeys,
        context.req.valid('param').keyId,
      );
      return data(context, { removed: true });
    },
  );
}

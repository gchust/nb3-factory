import { Hono } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import {
  accessServiceToken,
  integrationKeyServiceToken,
} from '../services/contracts.js';
import {
  asString,
  asText,
  forbidApiKeyActor,
  readJsonBody,
  requireActor,
  route,
} from './helpers.js';

/**
 * Administrator management of the integration account's API keys.
 *
 * Better Auth's own key endpoints act only on the caller's own keys, so an
 * administrator cannot issue a device-platform credential through the
 * self-service page. This router authorizes the administrator and delegates to
 * `IntegrationKeyService`, which uses the plugin's trusted server API. The
 * secret is returned exactly once, at creation; lists never include it.
 *
 * Minting a machine credential is not a ticket-lifecycle action, but it is
 * still an administrative one, so an API key may not perform it: only an
 * interactive administrator session may.
 */
export function createIntegrationKeyRouter(app: Application): Hono {
  const router = new Hono();
  const keys = () => app.container.resolve(integrationKeyServiceToken);
  const access = () => app.container.resolve(accessServiceToken);

  router.get(
    '/integration-keys/targets',
    route(async (context) => {
      forbidApiKeyActor(context);
      const actor = await requireActor(context, access());
      const targets = await keys().listTargets(actor);
      return context.json({ data: targets });
    }),
  );

  router.get(
    '/integration-keys',
    route(async (context) => {
      forbidApiKeyActor(context);
      const actor = await requireActor(context, access());
      const userId = context.req.query('userId') || undefined;
      const list = await keys().listKeys(actor, userId);
      return context.json({ data: list });
    }),
  );

  router.post(
    '/integration-keys',
    route(async (context) => {
      forbidApiKeyActor(context);
      const actor = await requireActor(context, access());
      const body = await readJsonBody(context);
      const expiresInRaw = body.expiresIn;
      const expiresIn =
        expiresInRaw === null || expiresInRaw === undefined
          ? null
          : Number(expiresInRaw);
      const created = await keys().createKey(actor, {
        userId: asString(body.userId),
        name: asText(body.name),
        expiresIn: Number.isFinite(expiresIn) ? expiresIn : null,
      });
      return context.json({ data: created.key, secret: created.secret }, 201);
    }),
  );

  router.delete(
    '/integration-keys/:id',
    route(async (context) => {
      forbidApiKeyActor(context);
      const actor = await requireActor(context, access());
      await keys().revokeKey(actor, context.req.param('id') ?? '');
      return context.json({ data: { revoked: true } });
    }),
  );

  return router;
}

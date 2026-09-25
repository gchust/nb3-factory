import { randomUUID } from 'node:crypto';

import { Hono, type Context } from 'hono';

import { joinBasePath } from '@nocobase/app-server/support';

/**
 * The isolated receiver the delivery worker posts test notifications to.
 *
 * The requirements ask for one external test notification whose delivery can be inspected on the existing
 * diagnostics page. The Notification plugin already owns that page, the test dialog and the delivery records; what
 * is missing is a configured channel and something to deliver to. This module is that destination: a loopback HTTP
 * endpoint the application calls through the same delivery pipeline as any other provider, so the delivery status and
 * its failure reason are recorded exactly as they would be for a real integration.
 *
 * It lives beside `config/`, `providers/` and `routes/` rather than inside one of them because the channel
 * configuration, the provider that sends to it and the route that receives the message all have to agree on the
 * token, the paths and the URLs.
 */

/** Sent by the provider and checked by the route; it is a loopback shared secret, not a user credential. */
export const TEST_NOTIFICATION_RECEIVER_TOKEN_HEADER =
  'x-test-notification-token';

/** Forwarded from the delivery so a receipt can be tied back to a delivery record. */
export const TEST_NOTIFICATION_DELIVERY_ID_HEADER = 'x-nocobase-delivery-id';

export const TEST_NOTIFICATION_RECEIVER_PATH = '/test-notifications/receiver';
export const TEST_NOTIFICATION_FAILURE_PATH =
  '/test-notifications/receiver/failure';

/**
 * A per-process token instead of a stored secret: the receiver is only ever called by this same process, so the
 * value can be generated at startup. It keeps the public endpoint from accepting unrelated anonymous writes without
 * adding a configuration surface no one can set.
 */
export const testNotificationReceiverToken: string = randomUUID();

export interface TestNotificationReceiverUrls {
  readonly normal: string;
  readonly failure: string;
}

export interface TestNotificationReceiverRuntime {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly publicBasePath: string;
}

/**
 * Where this process can reach its own HTTP routes.
 *
 * The delivery worker calls back through the public base path, so the URL has to be built the same way the standalone
 * server mounts it — otherwise a base path such as `/main` would be sent to a route that does not exist.
 */
export function resolveTestNotificationReceiverUrls(
  runtime: TestNotificationReceiverRuntime,
): TestNotificationReceiverUrls {
  const host = resolveLoopbackHost(runtime.env.APP_SERVER_HOST);
  const port = runtime.env.APP_SERVER_PORT?.trim() || '13000';
  const origin = `http://${host}:${port}`;
  return {
    normal:
      origin +
      joinBasePath(
        runtime.publicBasePath,
        '/api' + TEST_NOTIFICATION_RECEIVER_PATH,
      ),
    failure:
      origin +
      joinBasePath(
        runtime.publicBasePath,
        '/api' + TEST_NOTIFICATION_FAILURE_PATH,
      ),
  };
}

/**
 * `0.0.0.0` and `::` are listen addresses, not reachable destinations, so a request to them is sent to loopback.
 */
function resolveLoopbackHost(value: string | undefined): string {
  const host = value?.trim();
  if (!host || host === '0.0.0.0' || host === '::' || host === '[::]') {
    return '127.0.0.1';
  }
  return host;
}

export function createTestNotificationReceiverRouter(): Hono {
  const router = new Hono();

  // The check is per-handler rather than a `use('*')` middleware: this router is mounted at the application's
  // `/api`, so a wildcard middleware would also answer every unmatched `/api/...` path and hide the SPA fallback.
  router.post(TEST_NOTIFICATION_RECEIVER_PATH, (context) => {
    const denied = rejectWithoutReceiverToken(context);
    if (denied) return denied;
    return context.json({
      data: {
        accepted: true,
        deliveryId: context.req.header(TEST_NOTIFICATION_DELIVERY_ID_HEADER),
        receivedAt: new Date().toISOString(),
      },
    });
  });

  router.post(TEST_NOTIFICATION_FAILURE_PATH, (context) => {
    const denied = rejectWithoutReceiverToken(context);
    if (denied) return denied;
    return context.json(
      {
        error: {
          code: 'TEST_RECEIVER_REJECTED',
          message:
            'The isolated test receiver rejected this notification on purpose.',
        },
      },
      400,
    );
  });

  return router;
}

function rejectWithoutReceiverToken(context: Context): Response | undefined {
  if (
    context.req.header(TEST_NOTIFICATION_RECEIVER_TOKEN_HEADER) ===
    testNotificationReceiverToken
  ) {
    return undefined;
  }
  return context.json(
    {
      error: {
        code: 'TEST_RECEIVER_FORBIDDEN',
        message: 'The test receiver requires a valid delivery token.',
      },
    },
    403,
  );
}

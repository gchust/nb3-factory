// @vitest-environment node

import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createNotificationRegistry } from '@nocobase/app-plugin-notification/server';
import type { NotificationConfig } from '@nocobase/app-plugin-notification/server';
import { registerBuiltInNotificationProviders } from '@nocobase/app-plugin-notification-providers/server';
import { afterEach, describe, expect, it } from 'vitest';

import notificationConfig from '../../server/config/notification.js';
import {
  createTestNotificationReceiverRouter,
  TEST_NOTIFICATION_RECEIVER_TOKEN_HEADER,
  testNotificationReceiverToken,
} from '../../server/notifications/test-receiver.js';
import {
  createTestWebhookProviderDefinition,
  defineTestWebhookProviderConfig,
} from '../../server/notifications/test-webhook-provider.js';

const openServers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

async function listen(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

async function createProvider(url: string) {
  const definition = createTestWebhookProviderDefinition();
  return definition.createProvider(
    {} as never,
    defineTestWebhookProviderConfig({ webhookUrl: url, token: 'test-token' }),
  );
}

function send(
  provider: Awaited<ReturnType<typeof createProvider>>,
  text: string,
) {
  return provider.send({
    message: { recipient: { webhook: true }, content: { text } },
    notificationId: 'notification-1',
    deliveryId: 'delivery-1',
    attemptId: 'attempt-1',
    deadline: new Date(Date.now() + 5_000).toISOString(),
    signal: new AbortController().signal,
  });
}

function buildRuntime(env: Record<string, string> = {}) {
  return {
    env,
    routing: { publicBasePath: '/main' },
  } as never;
}

describe('external test notification provider', () => {
  it('reports accepted when the receiver answers 2xx', async () => {
    const url = await listen((_request, response) => {
      response.statusCode = 200;
      response.end(JSON.stringify({ data: { accepted: true } }));
    });

    const result = await send(await createProvider(url), 'hello');

    expect(result).toEqual({ status: 'accepted' });
  });

  it('keeps the receiver reason on a controlled failure', async () => {
    const url = await listen((_request, response) => {
      response.statusCode = 400;
      response.end(
        JSON.stringify({
          error: {
            code: 'TEST_RECEIVER_REJECTED',
            message:
              'The isolated test receiver rejected this notification on purpose.',
          },
        }),
      );
    });

    const result = await send(await createProvider(url), 'hello');

    expect(result).toEqual({
      status: 'failed',
      disposition: 'never',
      error: {
        code: '400',
        category: 'content',
        message:
          'The isolated test receiver rejected this notification on purpose.',
      },
    });
  });

  it('treats a 5xx response as an unknown outcome, not a success', async () => {
    const url = await listen((_request, response) => {
      response.statusCode = 503;
      response.end('receiver unavailable');
    });

    const result = await send(await createProvider(url), 'hello');

    expect(result).toEqual({
      status: 'submission_unknown',
      error: {
        code: '503',
        category: 'provider',
        message: 'receiver unavailable',
      },
    });
  });

  it('reports a network failure when the receiver is unreachable', async () => {
    const url = await listen((_request, response) => response.end('ok'));
    const server = openServers.pop();
    await new Promise<void>((resolve) => server?.close(() => resolve()));

    const result = await send(await createProvider(url), 'hello');

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.disposition).toBe('same_provider');
    expect(result.error.category).toBe('network');
  });

  it('reports an aborted send as an unknown outcome', async () => {
    const provider = await createProvider('http://127.0.0.1:1/hook');
    const result = await provider.send({
      message: { recipient: { webhook: true }, content: { text: 'hello' } },
      notificationId: 'notification-1',
      deliveryId: 'delivery-1',
      attemptId: 'attempt-1',
      deadline: new Date(Date.now() + 5_000).toISOString(),
      signal: AbortSignal.abort(),
    });

    expect(result).toEqual({
      status: 'submission_unknown',
      error: {
        code: 'HTTP_ABORTED',
        category: 'timeout',
        message: expect.any(String),
      },
    });
  });

  it('rejects a plain HTTP receiver that is not on loopback', async () => {
    const definition = createTestWebhookProviderDefinition();
    expect(() =>
      definition.validateConfig?.({
        provider: 'test-webhook',
        webhookUrl: 'http://receiver.example.test/hook',
      }),
    ).toThrow(/loopback/u);
  });
});

describe('isolated test notification receiver', () => {
  const normalPath = 'http://localhost/test-notifications/receiver';
  const failurePath = 'http://localhost/test-notifications/receiver/failure';

  it('rejects a request without the delivery token', async () => {
    const response = await createTestNotificationReceiverRouter().request(
      normalPath,
      { method: 'POST' },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'TEST_RECEIVER_FORBIDDEN' },
    });
  });

  it('rejects a request with the wrong delivery token', async () => {
    const response = await createTestNotificationReceiverRouter().request(
      normalPath,
      {
        method: 'POST',
        headers: { [TEST_NOTIFICATION_RECEIVER_TOKEN_HEADER]: 'not-the-token' },
      },
    );

    expect(response.status).toBe(403);
  });

  it('accepts a delivery carrying the token', async () => {
    const response = await createTestNotificationReceiverRouter().request(
      normalPath,
      {
        method: 'POST',
        headers: {
          [TEST_NOTIFICATION_RECEIVER_TOKEN_HEADER]:
            testNotificationReceiverToken,
          'x-nocobase-delivery-id': 'delivery-1',
        },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { accepted: true, deliveryId: 'delivery-1' },
    });
  });

  it('answers the failure path with a stated reason', async () => {
    const response = await createTestNotificationReceiverRouter().request(
      failurePath,
      {
        method: 'POST',
        headers: {
          [TEST_NOTIFICATION_RECEIVER_TOKEN_HEADER]:
            testNotificationReceiverToken,
        },
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'TEST_RECEIVER_REJECTED',
        message: expect.stringContaining(
          'rejected this notification on purpose',
        ),
      },
    });
  });
});

describe('external test notification configuration', () => {
  it('configures a normal and a controlled failure channel on loopback', () => {
    const config = notificationConfig(buildRuntime()) as NotificationConfig;

    expect(Object.keys(config.channels)).toEqual([
      'test-inbox',
      'test-inbox-failure',
    ]);
    expect(config.channels['test-inbox']).toMatchObject({
      provider: 'test-webhook',
      webhookUrl: 'http://127.0.0.1:13000/main/api/test-notifications/receiver',
    });
    expect(config.channels['test-inbox-failure']).toMatchObject({
      provider: 'test-webhook',
      webhookUrl:
        'http://127.0.0.1:13000/main/api/test-notifications/receiver/failure',
    });
  });

  it('lets an isolated receiver and channel name come from the environment', () => {
    const config = notificationConfig(
      buildRuntime({
        FACTORY_TEST_CHANNEL: 'team-inbox',
        FACTORY_TEST_RECEIVER_URL: 'https://receiver.example.test/hook',
      }),
    ) as NotificationConfig;

    expect(Object.keys(config.channels)).toEqual([
      'team-inbox',
      'team-inbox-failure',
    ]);
    expect(config.channels['team-inbox']).toMatchObject({
      webhookUrl: 'https://receiver.example.test/hook',
    });
    // The failure channel stays on the in-process receiver regardless of the external normal channel.
    expect(config.channels['team-inbox-failure']).toMatchObject({
      webhookUrl:
        'http://127.0.0.1:13000/main/api/test-notifications/receiver/failure',
    });
  });

  it('ignores an invalid environment receiver URL instead of failing startup', () => {
    const config = notificationConfig(
      buildRuntime({
        FACTORY_TEST_RECEIVER_URL: 'http://receiver.example.test/hook',
      }),
    ) as NotificationConfig;

    expect(config.channels['test-inbox']).toMatchObject({
      webhookUrl: 'http://127.0.0.1:13000/main/api/test-notifications/receiver',
    });
  });

  it('registers both channels as selectable test targets', () => {
    const config = notificationConfig(buildRuntime()) as NotificationConfig;
    const registry = createNotificationRegistry();
    registerBuiltInNotificationProviders(registry);
    registry.registerProvider(createTestWebhookProviderDefinition());

    expect(() => registry.validate(config)).not.toThrow();
    expect(
      registry.testTargets(config).map((target) => target.channel.name),
    ).toEqual(['test-inbox', 'test-inbox-failure']);
  });
});

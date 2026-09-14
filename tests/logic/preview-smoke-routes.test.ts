import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import { ServiceContainer } from '@nocobase/service-provider';
import type { Context } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  accessCounterServiceToken,
  HOME_COUNTER_KEY,
} from '../../server/providers/access-counter.js';
import { buildInfoServiceToken } from '../../server/providers/build-info.js';
import { previewSmokeRoutes } from '../../server/routes/preview-smoke.js';

const AUTH_HEADER = 'authorization';
const VALID_TOKEN = 'Bearer test-token';

const buildInfo = {
  name: 'Smoke App',
  startedAt: '2026-09-14T08:30:00.000Z',
  nodeVersion: 'v24.20.0',
};

interface RouterFixture {
  request(path: string, init?: RequestInit): Promise<Response>;
  incrementKeys: string[];
}

async function createFixture(): Promise<RouterFixture> {
  const container = new ServiceContainer();
  const incrementKeys: string[] = [];
  let count = 0;

  container.instance(authenticationToken, {
    required:
      () =>
      async (
        context: Context,
        next: () => Promise<void>,
      ): Promise<Response | void> => {
        if (context.req.header(AUTH_HEADER) !== VALID_TOKEN) {
          return context.json({ error: 'Unauthorized' }, 401);
        }
        await next();
      },
  } as never);

  container.instance(buildInfoServiceToken, { get: () => buildInfo });
  container.instance(accessCounterServiceToken, {
    read: async (key: string) => {
      incrementKeys.push(key);
      return count;
    },
    increment: async (key: string) => {
      incrementKeys.push(key);
      count += 1;
      return count;
    },
  });

  const router = await previewSmokeRoutes.createRouter({
    container,
  } as unknown as Application);

  return {
    incrementKeys,
    request: (path, init) => router.request(path, init),
  };
}

describe('preview smoke routes', () => {
  let fixture: RouterFixture;

  beforeEach(async () => {
    fixture = await createFixture();
  });

  it('rejects anonymous callers with 401', async () => {
    const info = await fixture.request('/preview-smoke/info');
    expect(info.status).toBe(401);

    const visits = await fixture.request('/preview-smoke/visits', {
      method: 'POST',
    });
    expect(visits.status).toBe(401);
  });

  it('returns server-provided build information to a signed-in caller', async () => {
    const response = await fixture.request('/preview-smoke/info', {
      headers: { [AUTH_HEADER]: VALID_TOKEN },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: buildInfo });
  });

  it('increments the home counter and returns the new value', async () => {
    const first = await fixture.request('/preview-smoke/visits', {
      headers: { [AUTH_HEADER]: VALID_TOKEN },
      method: 'POST',
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ data: { count: 1 } });

    const second = await fixture.request('/preview-smoke/visits', {
      headers: { [AUTH_HEADER]: VALID_TOKEN },
      method: 'POST',
    });
    expect(await second.json()).toEqual({ data: { count: 2 } });

    const read = await fixture.request('/preview-smoke/visits', {
      headers: { [AUTH_HEADER]: VALID_TOKEN },
    });
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ data: { count: 2 } });

    expect(fixture.incrementKeys).toEqual([
      HOME_COUNTER_KEY,
      HOME_COUNTER_KEY,
      HOME_COUNTER_KEY,
    ]);
  });
});

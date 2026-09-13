import type { Auth } from '@nocobase/app-plugin-authentication/server';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import { ServiceContainer } from '@nocobase/service-provider';
import type { Context, Next } from 'hono';
import { describe, expect, it } from 'vitest';

import type { Announcement } from '../../server/providers/announcements.js';
import {
  announcementServiceToken,
  type AnnouncementService,
} from '../../server/providers/announcements.js';
import { announcementsRoutes } from '../../server/routes/announcements.js';

const AUTHORIZATION = 'Bearer test-session';

function createAuthDouble(): Auth {
  return {
    required:
      () =>
      async (context: Context, next: Next): Promise<Response | void> => {
        if (context.req.header('authorization') === undefined) {
          return context.json({ code: 'UNAUTHORIZED' }, 401);
        }
        await next();
      },
  } as unknown as Auth;
}

function createServiceDouble(items: Announcement[] = []): AnnouncementService {
  let nextId = items.length + 1;
  return {
    async list() {
      return items;
    },
    async create(input) {
      const created: Announcement = {
        id: nextId,
        title: input.title,
        body: input.body,
        createdAt: '2026-09-13T00:00:00.000Z',
      };
      nextId += 1;
      items.unshift(created);
      return created;
    },
  };
}

async function createRouter(items: Announcement[] = []) {
  const container = new ServiceContainer();
  container.instance(authenticationToken, createAuthDouble());
  container.instance(announcementServiceToken, createServiceDouble(items));
  return announcementsRoutes.createRouter({
    container,
  } as unknown as Application);
}

describe('announcements routes', () => {
  it('rejects an anonymous list request with 401', async () => {
    const router = await createRouter();
    const response = await router.request('/announcements');
    expect(response.status).toBe(401);
  });

  it('returns the announcements for a signed-in caller', async () => {
    const router = await createRouter([
      {
        id: 1,
        title: 'Existing',
        body: 'Already here',
        createdAt: '2026-09-12T00:00:00.000Z',
      },
    ]);

    const response = await router.request('/announcements', {
      headers: { authorization: AUTHORIZATION },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: 1,
          title: 'Existing',
          body: 'Already here',
          createdAt: '2026-09-12T00:00:00.000Z',
        },
      ],
    });
  });

  it('rejects an anonymous publish request with 401', async () => {
    const router = await createRouter();
    const response = await router.request('/announcements', {
      body: JSON.stringify({ title: 'Title', body: 'Body' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(response.status).toBe(401);
  });

  it('publishes an announcement for a signed-in caller', async () => {
    const items: Announcement[] = [];
    const router = await createRouter(items);

    const response = await router.request('/announcements', {
      body: JSON.stringify({ title: '  Release  ', body: '  Notes  ' }),
      headers: {
        authorization: AUTHORIZATION,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      data: {
        id: 1,
        title: 'Release',
        body: 'Notes',
        createdAt: '2026-09-13T00:00:00.000Z',
      },
    });
    expect(items).toHaveLength(1);
  });

  it.each([
    [{ body: 'Body' }, 'TITLE_REQUIRED'],
    [{ title: '   ', body: 'Body' }, 'TITLE_REQUIRED'],
    [{ title: 'Title' }, 'BODY_REQUIRED'],
    [{ title: 'x'.repeat(201), body: 'Body' }, 'TITLE_TOO_LONG'],
  ])('rejects invalid input %#', async (payload, code) => {
    const router = await createRouter();
    const response = await router.request('/announcements', {
      body: JSON.stringify(payload),
      headers: {
        authorization: AUTHORIZATION,
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code });
  });

  it('does not apply the announcements auth check to other paths', async () => {
    const router = await createRouter();
    const response = await router.request('/unrelated');
    // A missing route is a 404, not the 401 an over-broad `use('*')` would produce.
    expect(response.status).toBe(404);
  });
});

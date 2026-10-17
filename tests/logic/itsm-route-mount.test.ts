// The ticket API routes are mounted on the `/api` router by `server/routes/index.ts`. `defineApiRoutes` contributes
// that router's own paths, so an inner prefix here would double the segment (`/api/tickets/tickets`) and leave the
// documented `/api/tickets` answering 404. These tests exercise the contributed router directly and pin its paths.
//
// @vitest-environment node
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { ticketApiRoutes } from '../../server/routes/tickets.js';

const list = vi.fn(async () => ({ items: [], total: 0 }));

/** The slice of the application the ticket router resolves: the session middleware and the ticket service. */
function createTestApplication(): Application {
  const auth = {
    required:
      () =>
      async (
        context: {
          req: { path: string };
          set: (key: string, value: unknown) => void;
          json: (body: unknown, status: number) => Response;
        },
        next: () => Promise<void>,
      ) => {
        // The real middleware relies on being scoped by the router. This fake refuses a path outside `/tickets` so a
        // leaked guard shows up as a 401 here rather than passing through unnoticed.
        if (!context.req.path.startsWith('/tickets')) {
          return context.json({ error: 'guard leaked' }, 401);
        }
        context.set('auth', {
          user: { id: 'user-1', name: 'User One', email: 'u@example.com' },
        });
        await next();
      },
  };
  const service = {
    resolveRole: async () => 'employee',
    list,
    dashboard: async () => ({
      role: 'employee',
      pendingAssignment: [],
      overdue: [],
      workloads: [],
    }),
    listEngineers: async () => [],
  };
  return {
    container: {
      has: () => true,
      resolve: (token: unknown) =>
        token === authenticationToken ? auth : service,
    },
  } as unknown as Application;
}

describe('ticket API routes', () => {
  it('answers the list at /tickets without a doubled prefix', async () => {
    list.mockClear();
    const router = await ticketApiRoutes.createRouter(createTestApplication());

    const response = await router.request('/tickets');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [],
      meta: { total: 0 },
    });
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid query with the automatic 400', async () => {
    const router = await ticketApiRoutes.createRouter(createTestApplication());

    const response = await router.request('/tickets?limit=not-a-number');

    expect(response.status).toBe(400);
  });

  it('mounts the single-ticket actions below /tickets/:ticketId', async () => {
    const router = await ticketApiRoutes.createRouter(createTestApplication());

    const response = await router.request('/tickets/7/confirm', {
      method: 'POST',
    });

    // The fake service has no `confirm`, so reaching the handler surfaces as a 500; the point is that the path
    // matched the action route at all rather than falling through to a 404.
    expect(response.status).not.toBe(404);
  });

  it('does not authenticate paths it does not own once merged into the application router', async () => {
    // Hono merges a mounted sub-router's middleware and routes into its parent, so a `use('*')` here would
    // authenticate every contribution mounted after the tickets. Merge into a parent and answer an unrelated path
    // to prove the guard stays on `/tickets`.
    const parent = new Hono();
    parent.route(
      '/',
      await ticketApiRoutes.createRouter(createTestApplication()),
    );
    parent.get('/unrelated', (context) => context.json({ ok: true }));

    const response = await parent.request('/unrelated');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});

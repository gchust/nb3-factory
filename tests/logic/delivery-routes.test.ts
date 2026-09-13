import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';

import { deliveryServiceToken } from '../../server/providers/delivery-provider';
import { deliveryApiRoutes } from '../../server/routes/delivery';

interface StubSession {
  userId: string;
}

function createAuthStub(session: StubSession | null) {
  return {
    required:
      () =>
      async (
        context: {
          json: (body: unknown, status: 401) => Response;
          set: (key: string, value: unknown) => void;
        },
        next: () => Promise<void>,
      ) => {
        if (!session) {
          return context.json({ error: { code: 'UNAUTHENTICATED' } }, 401);
        }
        context.set('auth', { user: { id: session.userId }, session: {} });
        return next();
      },
    optional: () => async (_context: unknown, next: () => Promise<void>) =>
      next(),
  };
}

function createAuthorizationStub(roleKeys: readonly string[]) {
  return {
    permissionSets: {
      getEffective: async () => roleKeys.map((key) => ({ key, grants: [] })),
    },
  };
}

async function buildRouter(options: {
  session?: StubSession | null;
  roles?: readonly string[];
  service?: Record<string, unknown>;
}) {
  const container = new ServiceContainer();
  container.instance(
    authenticationToken,
    createAuthStub(options.session ?? null) as never,
  );
  container.instance(
    authorizationToken,
    createAuthorizationStub(options.roles ?? []) as never,
  );
  container.instance(deliveryServiceToken, (options.service ?? {}) as never);
  return deliveryApiRoutes.createRouter({ container } as never);
}

describe('delivery route authentication', () => {
  it('rejects anonymous project listing', async () => {
    const router = await buildRouter({});
    const response = await router.request('/delivery/projects');
    expect(response.status).toBe(401);
  });

  it('rejects anonymous task creation', async () => {
    const router = await buildRouter({});
    const response = await router.request('/delivery/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    });
    expect(response.status).toBe(401);
  });

  it('rejects anonymous attachment download', async () => {
    const router = await buildRouter({});
    const response = await router.request('/delivery-files/abc/content');
    expect(response.status).toBe(401);
  });
});

describe('delivery route authorization', () => {
  it('returns the caller role', async () => {
    const router = await buildRouter({
      session: { userId: 'u1' },
      roles: ['project-member'],
    });
    const response = await router.request('/delivery/me');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { userId: string; role: string };
    };
    expect(body.data).toEqual({ userId: 'u1', role: 'member' });
  });

  it('forbids a member creating a project without touching the service', async () => {
    const createProject = vi.fn();
    const router = await buildRouter({
      session: { userId: 'u1' },
      roles: ['project-member'],
      service: { createProject },
    });
    const response = await router.request('/delivery/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Nope', clientName: 'Nope' }),
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('DELIVERY_FORBIDDEN');
    expect(createProject).not.toHaveBeenCalled();
  });

  it('forbids a member editing a project', async () => {
    const router = await buildRouter({
      session: { userId: 'u1' },
      roles: ['project-member'],
      service: { updateProject: vi.fn() },
    });
    const response = await router.request('/delivery/projects/1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Nope' }),
    });
    expect(response.status).toBe(403);
  });

  it('lets a manager list projects', async () => {
    const listProjects = vi.fn(async () => []);
    const router = await buildRouter({
      session: { userId: 'm1' },
      roles: ['project-manager'],
      service: { listProjects },
    });
    const response = await router.request('/delivery/projects');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
    expect(listProjects).toHaveBeenCalledWith(undefined);
  });

  it('passes the member identity into timesheet scoping', async () => {
    const listTimesheets = vi.fn(async () => []);
    const router = await buildRouter({
      session: { userId: 'u1' },
      roles: ['project-member'],
      service: { listTimesheets },
    });
    const response = await router.request('/delivery/timesheets?userId=u2');
    expect(response.status).toBe(200);
    expect(listTimesheets).toHaveBeenCalledWith(
      { taskId: undefined, projectId: undefined, userId: 'u2' },
      { userId: 'u1', role: 'member' },
    );
  });

  it('treats the system administrator as a manager of everything', async () => {
    const deleteProject = vi.fn(async () => ({ fileIds: [] }));
    const router = await buildRouter({
      session: { userId: 'admin' },
      roles: ['system-administrator'],
      service: {
        deleteProject,
        removeFileMetadata: vi.fn(async () => []),
      },
    });
    const response = await router.request('/delivery/projects/5', {
      method: 'DELETE',
    });
    expect(response.status).toBe(200);
    expect(deleteProject).toHaveBeenCalledWith(5);
  });
});

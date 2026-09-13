// @vitest-environment node
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono, type Context } from 'hono';
import { describe, expect, it } from 'vitest';

import {
  EMPLOYEE_FILE_ACCESS_PATH,
  EMPLOYEE_FILE_RESOURCE,
} from '../../server/providers/employee-records.js';
import { withAuthentication } from '../../server/routes/employee-attachments.js';

const AUTH_HEADER = 'x-test-auth';

/**
 * The File plugin is enabled as a root-scope contribution mounted at `/`. Wrapping it with an unscoped
 * `use('*')` therefore intercepts the SPA document and every other root request, which is what broke the
 * application after the first implementation. These tests pin the middleware to the paths the module owns.
 */
function createApplication(): Application {
  const container = new ServiceContainer();
  container.instance(authenticationToken, {
    required:
      () =>
      async (
        context: Context,
        next: () => Promise<void>,
      ): Promise<Response | void> => {
        if (context.req.header(AUTH_HEADER) !== 'yes') {
          return context.json({ code: 'UNAUTHORIZED' }, 401);
        }
        await next();
      },
  } as never);
  return { container, publicBasePath: '/main' } as unknown as Application;
}

async function createAssembledRouter(): Promise<Hono> {
  const application = createApplication();

  const api = withAuthentication({
    scope: 'api',
    createRouter: async () => {
      const router = new Hono();
      router.post(`/${EMPLOYEE_FILE_RESOURCE}:uploadOne`, (context) =>
        context.text('uploaded'),
      );
      return router;
    },
  });

  const root = withAuthentication({
    scope: 'root',
    createRouter: async () => {
      const router = new Hono();
      router.get(`${EMPLOYEE_FILE_ACCESS_PATH}/:file`, (context) =>
        context.text('content'),
      );
      return router;
    },
  });

  const app = new Hono();
  app.route('/api', await api.createRouter(application));
  app.route('/', await root.createRouter(application));

  const spa = new Hono();
  spa.get('/', (context) => context.text('spa'));
  app.route('/', spa);

  return app;
}

describe('employee attachment authentication scoping', () => {
  it('leaves the SPA document reachable for anonymous requests', async () => {
    const app = await createAssembledRouter();
    const response = await app.request('/');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('spa');
  });

  it('requires authentication for uploads and content, and only those paths', async () => {
    const app = await createAssembledRouter();

    const uploadAnonymous = await app.request(
      `/api/${EMPLOYEE_FILE_RESOURCE}:uploadOne`,
      { method: 'POST' },
    );
    expect(uploadAnonymous.status).toBe(401);

    const uploadAuthenticated = await app.request(
      `/api/${EMPLOYEE_FILE_RESOURCE}:uploadOne`,
      { method: 'POST', headers: { [AUTH_HEADER]: 'yes' } },
    );
    expect(uploadAuthenticated.status).toBe(200);
    expect(await uploadAuthenticated.text()).toBe('uploaded');

    const contentAnonymous = await app.request(
      `${EMPLOYEE_FILE_ACCESS_PATH}/11111111-1111-4111-8111-111111111111.txt`,
    );
    expect(contentAnonymous.status).toBe(401);

    const contentAuthenticated = await app.request(
      `${EMPLOYEE_FILE_ACCESS_PATH}/11111111-1111-4111-8111-111111111111.txt`,
      { headers: { [AUTH_HEADER]: 'yes' } },
    );
    expect(contentAuthenticated.status).toBe(200);
    expect(await contentAuthenticated.text()).toBe('content');

    const unrelatedApi = await app.request('/api/healthz');
    expect(unrelatedApi.status).toBe(404);
  });
});

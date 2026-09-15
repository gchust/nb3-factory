import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { ServiceContainer } from '@nocobase/service-provider';
import type { MiddlewareHandler } from 'hono';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  INSPECTION_PHOTOS_ACCESS_PATH,
  createInspectionFileRoutes,
} from '../../server/routes/inspection-files.js';

const FILE_ID = '11111111-1111-4111-8111-111111111111';

let rootRouter: {
  request: (input: string, init?: RequestInit) => Promise<Response>;
};
let findOne: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  const auth = {
    required(): MiddlewareHandler<AuthEnv> {
      return async (context, next) => {
        const id = context.req.header('x-test-user');
        if (!id) return context.json({ code: 'UNAUTHORIZED' }, 401);
        context.set('auth', {
          user: { id, name: id, email: `${id}@example.invalid` },
          session: { id: 'session' },
        } as never);
        await next();
      };
    },
  };

  findOne = vi.fn(async () => undefined);
  const repositories = {
    repository: () => ({
      findOne,
      getUrl: (record: { id: string; ext: string }) =>
        `${INSPECTION_PHOTOS_ACCESS_PATH}/${record.id}.${record.ext}`,
      validateCollection: async () => undefined,
    }),
  };

  const container = new ServiceContainer();
  container.instance(authenticationToken, auth as never);
  container.instance(serverFileRepositoryManagerToken, repositories as never);

  const contributions = createInspectionFileRoutes();
  const rootContribution = contributions.find(
    (contribution) => contribution.scope === 'root',
  );
  if (!rootContribution)
    throw new Error('The file route contribution is not declared.');

  rootRouter = (await rootContribution.createRouter({
    container,
    publicBasePath: '/main',
  } as never)) as never;
});

/**
 * A root scoped contribution is mounted at `/` *inside* the public base path,
 * so a `use('*')` on it would answer 401 for every request the application
 * serves — the SPA, the sign-in page and the API alike. This is a regression
 * test for exactly that: the file routes may only gate the access path they
 * own.
 */
describe('inspection file route scoping', () => {
  it('does not intercept an unrelated application path', async () => {
    for (const path of ['/', '/login', '/register', '/inspection/records']) {
      const response = await rootRouter.request(path);
      expect(
        response.status,
        `${path} must not be gated by the file routes`,
      ).not.toBe(401);
    }
  });

  it('requires a session on the file access path', async () => {
    const response = await rootRouter.request(
      `${INSPECTION_PHOTOS_ACCESS_PATH}/${FILE_ID}.png`,
    );
    expect(response.status).toBe(401);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('serves the access path once a session is present', async () => {
    const response = await rootRouter.request(
      `${INSPECTION_PHOTOS_ACCESS_PATH}/${FILE_ID}.png`,
      { headers: { 'x-test-user': 'viewer-1' } },
    );
    // The stub repository holds no such file, so a matched-but-missing file is
    // a 404 rather than a 401: authentication passed and the route ran.
    expect(response.status).toBe(404);
    expect(findOne).toHaveBeenCalled();
  });

  it('leaves a nested path under the access path gated', async () => {
    const response = await rootRouter.request(
      `${INSPECTION_PHOTOS_ACCESS_PATH}/not-a-file`,
    );
    expect(response.status).toBe(401);
  });
});

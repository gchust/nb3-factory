import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppRouteContribution,
  type AppRouterFactory,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import { Hono } from 'hono';

/** Logical collection holding receipt metadata, created by the expense claims migration. */
export const EXPENSE_CLAIM_FILES_COLLECTION = 'expenseClaimFiles';

/** Application-internal content path the browser downloads receipt files from. */
export const EXPENSE_CLAIM_FILES_ACCESS_PATH = '/uploads/expense-claims';

/**
 * Wraps a generated route contribution so every one of its paths requires a
 * signed-in session. `defineFileRepositoryApiRoutes()` is public by design; the
 * application owns the authentication boundary, so it is installed here rather
 * than trusted to the generator.
 *
 * The wrapper is mounted at `/api` (api scope) or `/` (root scope), so a bare
 * `use('*', auth.required())` would demand a session for every sibling route —
 * the SPA at `/main/`, sign-in, and every other API contribution. `ownsPath`
 * confines the check to this repository's own paths and lets everything else
 * fall through untouched.
 */
function withAuthentication(
  contribution: AppRouteContribution<Application>,
  ownsPath: (path: string) => boolean,
): AppRouteContribution<Application> {
  const createRouter: AppRouterFactory<Application> = async (app) => {
    const auth = app.container.resolve(authenticationToken);
    const inner = await contribution.createRouter(app);
    const router = new Hono();
    router.use(
      '*',
      auth.required({ skip: (context) => !ownsPath(context.req.path) }),
    );
    router.route('/', inner);
    return router;
  };

  return contribution.scope === 'api'
    ? defineApiRoutes<Application>(createRouter)
    : defineRootRoutes<Application>(createRouter);
}

/**
 * Receipt upload and download routes. The client resource name is the
 * collection name, so the browser calls `/api/expenseClaimFiles:uploadMany`
 * and downloads from the `contentUrl` the API decorates.
 */
export function createExpenseClaimFileRoutes(): readonly AppRouteContribution<Application>[] {
  const contributions = defineFileRepositoryApiRoutes({
    repositories: [
      {
        name: EXPENSE_CLAIM_FILES_COLLECTION,
        collection: EXPENSE_CLAIM_FILES_COLLECTION,
        connection: 'main',
        disk: 'local',
        accessPath: EXPENSE_CLAIM_FILES_ACCESS_PATH,
        accessMode: 'stream',
        actions: {
          findMany: { maxLimit: 100 },
          findOne: {},
          uploadOne: { maxSize: 10 * 1024 * 1024 },
          uploadMany: { maxSize: 30 * 1024 * 1024 },
        },
      },
    ],
  });

  const apiPathPrefix = `/api/${encodeURIComponent(
    EXPENSE_CLAIM_FILES_COLLECTION,
  )}:`;
  const contentPathPrefix = `${EXPENSE_CLAIM_FILES_ACCESS_PATH}/`;

  return contributions.map((contribution) =>
    withAuthentication(
      contribution as AppRouteContribution<Application>,
      (path) =>
        path.startsWith(
          contribution.scope === 'api' ? apiPathPrefix : contentPathPrefix,
        ),
    ),
  );
}

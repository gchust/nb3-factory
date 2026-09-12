import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { contractsApiRoutes } from './contracts.js';

/**
 * File plugin routes for the contract archive, wrapped so every path requires
 * a signed-in session. The plugin contributes two route groups: the `/api`
 * file actions and the root content GET under each access path. The plugin's
 * content URLs are public by design — the application decides who may reach
 * them, and browser sessions carry the session cookie, so the preview and
 * download links below keep working.
 *
 * The session middleware is scoped to the plugin's own paths on purpose: a
 * blanket `router.use('*', ...)` on a mounted router would intercept every
 * request that reaches it — including the unauthenticated SPA shell at the
 * app base path — and the factory smoke/ready probes expect that path to
 * answer 2xx/3xx so the browser checks can even start. Scoping keeps the
 * archive endpoints authenticated without hiding the shell.
 */
const contractFileRoutes: readonly AppRouteContribution<Application>[] =
  defineFileRepositoryApiRoutes({
    repositories: [
      {
        name: 'contractBodyFiles',
        collection: 'contract_files',
        disk: 'local',
        accessPath: '/uploads/contract-bodies',
        actions: {
          findOne: {},
          findMany: { maxLimit: 100 },
        },
      },
      {
        name: 'contractAttachments',
        collection: 'contract_files',
        disk: 'local',
        accessPath: '/uploads/contract-attachments',
        actions: {
          findOne: {},
          findMany: { maxLimit: 100 },
        },
      },
    ],
  });

const [contractFileApiRoutes, contractFileContentRoutes] = contractFileRoutes;

function withRequiredSession(
  contribution: AppRouteContribution<Application>,
  pathPatterns: readonly string[],
): AppRouteContribution<Application> {
  return {
    ...contribution,
    createRouter: async (app) => {
      const router = new Hono();
      const auth = app.container.resolve(authenticationToken);
      for (const pattern of pathPatterns) {
        router.use(pattern, auth.required());
      }
      const innerRouter = await contribution.createRouter(app);
      router.route('/', innerRouter);
      return router;
    },
  };
}

const routes: readonly AppRouteContribution<Application>[] = [
  contractsApiRoutes,
  // The file CRUD/upload actions live under `/api/:name:*`. Mounted on the
  // `/api` scope only, so `*` cannot reach the SPA shell at the base path.
  withRequiredSession(contractFileApiRoutes, ['*']),
  // The content GET under each access path (e.g. `/uploads/contract-bodies/*`).
  withRequiredSession(contractFileContentRoutes, [
    '/uploads/contract-bodies/*',
    '/uploads/contract-attachments/*',
  ]),
];

export default routes;

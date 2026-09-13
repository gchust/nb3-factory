import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { productsApiRoutes } from './products.js';

/**
 * File plugin routes for the product gallery, wrapped so every path requires a
 * signed-in session. The plugin contributes two groups: the `/api` file
 * actions and the root content GET under the access path. Its content routes
 * are public by design — the application decides who may reach them, and
 * browser sessions carry the session cookie, so previews and downloads work.
 *
 * The session middleware is scoped to the plugin's own paths on purpose: a
 * blanket `router.use('*', ...)` on a mounted router would also intercept the
 * unauthenticated SPA shell at the app base path.
 */
const productFileRoutes: readonly AppRouteContribution<Application>[] =
  defineFileRepositoryApiRoutes({
    repositories: [
      {
        name: 'productImages',
        collection: 'product_image_files',
        disk: 'local',
        accessPath: '/uploads/product-images',
        actions: {
          uploadOne: { maxSize: 8 * 1024 * 1024 },
          uploadMany: { maxSize: 32 * 1024 * 1024 },
        },
      },
    ],
  });

const [productFileApiRoutes, productFileContentRoutes] = productFileRoutes;

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
      router.route('/', await contribution.createRouter(app));
      return router;
    },
  };
}

const routes: readonly AppRouteContribution<Application>[] = [
  productsApiRoutes,
  // The upload actions live under `/api/productImages:*`. Mounted on the
  // `/api` scope only, so `*` cannot reach the SPA shell at the base path.
  withRequiredSession(productFileApiRoutes, ['*']),
  // The content GET under `/uploads/product-images/*`.
  withRequiredSession(productFileContentRoutes, ['/uploads/product-images/*']),
];

export default routes;

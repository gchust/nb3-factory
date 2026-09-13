import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

/**
 * Invoice attachments.
 *
 * The file plugin's repository routes are public by design, so this module wraps both the metadata API and the content
 * route in an authentication check at the application boundary. The `invoice_files` collection is created by this
 * application's migration and exposed through the repository contract the plugin expects.
 */
const fileContributions = defineFileRepositoryApiRoutes({
  repositories: [
    {
      name: 'invoiceAttachments',
      collection: 'invoice_files',
      connection: 'main',
      disk: 'local',
      accessPath: '/uploads/invoices',
      accessMode: 'stream',
      actions: {
        uploadOne: { maxSize: 5 * 1024 * 1024 },
        uploadMany: { maxSize: 20 * 1024 * 1024 },
        findOne: {},
        findMany: { maxLimit: 100 },
        deleteOne: {},
      },
    },
  ],
});

const attachmentRoutes: readonly AppRouteContribution<Application>[] =
  fileContributions.map((contribution) => {
    if (contribution.scope === 'api') {
      return defineApiRoutes(async (app) => {
        const router = new Hono();
        const auth = app.container.resolve(authenticationToken);
        // Scope the guard to the upload resource. A `*` middleware here would leak onto every other /api route
        // once the contribution is mounted on the shared API router.
        router.use('/invoiceAttachments*', auth.required());
        router.route('/', await contribution.createRouter(app));
        return router;
      });
    }
    return defineRootRoutes(async (app) => {
      const router = new Hono();
      const auth = app.container.resolve(authenticationToken);
      // Scoped to the content prefix so it cannot protect the SPA shell at the application root.
      router.use('/uploads/invoices/*', auth.required());
      router.route('/', await contribution.createRouter(app));
      return router;
    });
  });

export default attachmentRoutes;

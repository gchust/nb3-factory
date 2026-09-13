import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type MiddlewareHandler } from 'hono';

/**
 * Attachment storage for the IT suite.
 *
 * The file plugin's repository routes are public by design; this application owns their security, so
 * both the metadata API and the content download are wrapped in required authentication. Any signed-in
 * user may upload; the business routes decide which files become visible on which record.
 */
const repository = {
  name: 'itAttachments',
  collection: 'it_files',
  disk: 'local',
  accessPath: '/uploads/it-attachments',
  accessMode: 'stream',
  actions: {
    findMany: { maxLimit: 200 },
    findOne: {},
    deleteOne: {},
    uploadOne: { maxSize: 10 * 1024 * 1024 },
    uploadMany: { maxSize: 30 * 1024 * 1024 },
  },
} as const;

const [fileApi, fileContent] = defineFileRepositoryApiRoutes({
  repositories: [repository],
});

export const fileRoutes: readonly AppRouteContribution<Application>[] = [
  defineApiRoutes(async (app) => {
    const auth = app.container.resolve(authenticationToken);
    const inner = await fileApi.createRouter(app);
    return secured(auth.required(), inner);
  }),
  defineRootRoutes(async (app) => {
    const auth = app.container.resolve(authenticationToken);
    const inner = await fileContent.createRouter(app);
    return secured(auth.required(), inner);
  }),
];

/**
 * Wraps a plugin router so `middleware` runs only for the paths that router actually serves.
 *
 * `secured(auth.required(), inner)` must not be `outer.use('*', ...)`: the content router is mounted
 * at the application root, so a wildcard middleware would authenticate every root request and answer
 * `/` — the SPA shell — with 401 before the SPA route can serve it. Scoping the middleware to the
 * routes the repository registered keeps unrelated paths falling through to the rest of the app.
 */
export function secured(
  middleware: MiddlewareHandler<AuthEnv>,
  inner: Hono,
): Hono {
  const outer = new Hono();
  for (const path of new Set(inner.routes.map((route) => route.path))) {
    outer.use(path, middleware);
  }
  outer.route('/', inner);
  return outer;
}

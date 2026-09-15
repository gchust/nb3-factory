import {
  authorizationToken,
  type AppAuthorization,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import type {
  AppApiRouteContribution,
  AppRootRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import {
  RECEIPT_COLLECTION,
  RECEIPT_CREATE_FIELDS,
  RECEIPT_FILE_MAX_SIZE,
  expenseServiceToken,
} from '../providers/expense-service.js';
import { authorizeDatabase } from './expense-access.js';

/**
 * The File plugin's repository routes are public by design; authentication and authorization are the
 * application's. Both the upload endpoint and the content (download) endpoint are wrapped here:
 *
 * - an upload requires the same `create` grant on receipts as adding one to a claim;
 * - a download requires a receipt the caller may read, so an unrelated account, and a receipt whose claim was
 *   cancelled, are both refused.
 *
 * Each guard is registered for the one path this contribution owns, never with a catch-all. `use('*')` is a
 * pattern rather than a prefix: this contribution mounts under `/api` and at `/`, so a catch-all also runs for
 * requests other contributions answer. The server registers the SPA routes after these, so a catch-all here
 * answered every page request with 401 before the SPA was ever reached.
 *
 * A content request is served when a receipt the caller may read references the file, or when no receipt
 * references it yet: the upload control previews a file immediately after upload, and linking it to a claim —
 * which is what makes it an attachment — happens in a second request. Cancelling a claim deletes both its
 * receipts and their file records, so a cancelled attachment is refused like any other.
 */
const FILE_RESOURCE = 'expenseReceiptFiles';
const CONTENT_PATH = '/uploads/expense-receipts';
/** The file plugin exposes exactly the actions declared below; `uploadOne` is the only mutating one. */
const UPLOAD_PATH = `/${FILE_RESOURCE}:uploadOne`;

const [fileApiContribution, fileContentContribution] =
  defineFileRepositoryApiRoutes({
    repositories: [
      {
        name: FILE_RESOURCE,
        collection: 'expenseReceiptFiles',
        connection: 'main',
        disk: 'local',
        accessPath: CONTENT_PATH,
        accessMode: 'stream',
        actions: {
          uploadOne: { maxSize: RECEIPT_FILE_MAX_SIZE },
        },
      },
    ],
  });

export const expenseFileUploadRoutes: AppApiRouteContribution<Application> = {
  scope: 'api',
  async createRouter(app) {
    const auth = app.container.resolve(authenticationToken);
    const authorization =
      app.container.resolve<AppAuthorization>(authorizationToken);
    const inner = await fileApiContribution.createRouter(app);

    const routes = new Hono<AuthorizationEnv>();
    routes.use(
      UPLOAD_PATH,
      auth.required(),
      authorization.middleware(),
      async (context, next) => {
        await authorizeDatabase(
          context.get('authz'),
          RECEIPT_COLLECTION,
          'create',
          { input: [...RECEIPT_CREATE_FIELDS], output: [] },
        );
        await next();
      },
    );
    routes.route('/', inner);
    const router = new Hono();
    router.route('/', routes);
    return router;
  },
};

export const expenseFileContentRoutes: AppRootRouteContribution<Application> = {
  scope: 'root',
  async createRouter(app) {
    const auth = app.container.resolve(authenticationToken);
    const authorization =
      app.container.resolve<AppAuthorization>(authorizationToken);
    const expense = app.container.resolve(expenseServiceToken);
    const inner = await fileContentContribution.createRouter(app);

    const routes = new Hono<AuthorizationEnv>();
    routes.use(
      `${CONTENT_PATH}/:file`,
      auth.required(),
      authorization.middleware(),
      async (context, next) => {
        const requested = context.req.param('file') ?? '';
        const fileId = requested.split('.')[0];
        const conditions = await authorizeDatabase(
          context.get('authz'),
          RECEIPT_COLLECTION,
          'read',
          { output: ['id', 'fileId'] },
        );
        const receipt = await expense.findReceiptByFileId(fileId, conditions);
        if (!receipt) {
          // Refused either because the receipt belongs to someone else, or because it was cancelled — unless the
          // file has not been attached to any claim yet, which is the uploader's own fresh upload.
          if (
            (await expense.isReceiptFileAttached(fileId)) ||
            !(await expense.getFileRecord(fileId))
          ) {
            return context.json({ code: 'FORBIDDEN' }, 403);
          }
        }
        await next();
      },
    );
    routes.route('/', inner);
    const router = new Hono();
    router.route('/', routes);
    return router;
  },
};

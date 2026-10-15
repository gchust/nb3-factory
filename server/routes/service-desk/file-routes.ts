import type { Application } from '@nocobase/app-server/application';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppApiRouteContribution,
  type AppRootRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

/** The Client resource screenshots and attachments are uploaded to. */
export const TICKET_ATTACHMENTS = 'ticketAttachments';
/** Where the content of an uploaded screenshot is served from. */
export const TICKET_ATTACHMENT_PATH = '/uploads/ticketAttachments';

const fields = [
  'id',
  'filename',
  'ext',
  'mimeType',
  'size',
  'createdAt',
  'updatedAt',
] as const;

const generated = defineFileRepositoryApiRoutes({
  repositories: [
    {
      name: TICKET_ATTACHMENTS,
      collection: 'ticketFiles',
      connection: 'main',
      disk: 'local',
      accessPath: TICKET_ATTACHMENT_PATH,
      accessMode: 'stream',
      // Static Policy: a session is required by the middleware below and an
      // upload supplies no caller fields, so the caller cannot widen its scope.
      policy: {
        read: { scope: true, fields: [...fields] },
        create: { scope: true },
        update: false,
        delete: false,
      },
      actions: {
        findMany: { maxLimit: 100 },
        findOne: {},
        uploadOne: { maxSize: 5 * 1024 * 1024 },
        uploadMany: { maxSize: 20 * 1024 * 1024 },
      },
    },
  ],
});

const [attachmentApi, attachmentContent] = generated;

if (!attachmentApi || !attachmentContent) {
  throw new Error('The ticket attachment file routes were not generated.');
}

/**
 * The file plugin's routes are public and application-owned authentication is
 * expected ahead of them. Each contribution is mounted inside a router that
 * guards only the prefix it owns, so nothing else mounted at `/api` or the
 * root is affected.
 */
function createAttachmentApiRouter(app: Application): Hono {
  const router = new Hono();
  const auth = app.container.resolve(authenticationToken);
  router.use(`/${TICKET_ATTACHMENTS}/*`, auth.required());
  return router;
}

function createAttachmentContentRouter(app: Application): Hono {
  const router = new Hono();
  const auth = app.container.resolve(authenticationToken);
  router.use(`${TICKET_ATTACHMENT_PATH}/*`, auth.required());
  return router;
}

export const attachmentApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes(async (app) => {
    const router = createAttachmentApiRouter(app);
    router.route('/', await attachmentApi.createRouter(app));
    return router;
  });

export const attachmentContentRoutes: AppRootRouteContribution<Application> =
  defineRootRoutes(async (app) => {
    const router = createAttachmentContentRouter(app);
    router.route('/', await attachmentContent.createRouter(app));
    return router;
  });

/**
 * Ticket attachments, through the File plugin's public repository API.
 *
 * The plugin's content route under `accessPath` serves anyone who holds a file's UUID and is deliberately public, so
 * this module mounts the application's own authentication in front of it. The middleware contributions come first in
 * `server/routes/index.ts`; contributions are mounted in array order, so a later file route is covered by the earlier
 * middleware without either knowing about the other.
 */
import { Hono } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppApiRouteContribution,
  type AppRootRouteContribution,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import {
  FILE_COLUMNS,
  defineFileRepositoryApiRoutes,
} from '@nocobase/app-plugin-file/server';

/** The exposure name, and the first segment of every attachment endpoint. */
export const TICKET_FILE_EXPOSURE = 'ticketAttachments';
/** Where the plugin serves the bytes; also the prefix this module authenticates. */
export const TICKET_FILE_ACCESS_PATH = '/uploads/ticketAttachments';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** `POST /api/ticketAttachments/...`: uploading and reading file records needs a session. */
export const fileApiAuth: AppApiRouteContribution<Application> =
  defineApiRoutes<Application>((app) => {
    const router = new Hono();
    if (!app.container.has(authenticationToken)) return router;
    router.use(
      `/${TICKET_FILE_EXPOSURE}/*`,
      app.container.resolve(authenticationToken).required(),
    );
    return router;
  });

/** `GET <base>/uploads/ticketAttachments/{id}`: the bytes are only for a signed-in caller. */
export const fileRootAuth: AppRootRouteContribution<Application> =
  defineRootRoutes<Application>((app) => {
    const router = new Hono();
    if (!app.container.has(authenticationToken)) return router;
    router.use(
      `${TICKET_FILE_ACCESS_PATH}/*`,
      app.container.resolve(authenticationToken).required(),
    );
    return router;
  });

/** The plugin's data endpoints and content route, with no authentication of their own. */
export const fileRoutes: readonly AppRouteContribution<Application>[] =
  defineFileRepositoryApiRoutes({
    repositories: [
      {
        name: TICKET_FILE_EXPOSURE,
        collection: 'ticketFiles',
        disk: 'local',
        accessPath: TICKET_FILE_ACCESS_PATH,
        accessMode: 'stream',
        policy: {
          read: { scope: true, fields: [...FILE_COLUMNS] },
          create: { scope: true },
          update: false,
          delete: false,
        },
        actions: {
          findMany: {},
          findOne: {},
          uploadOne: { maxSize: MAX_UPLOAD_BYTES },
          uploadMany: { maxSize: MAX_UPLOAD_BYTES },
        },
      },
    ],
  });

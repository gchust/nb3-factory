import { Hono } from 'hono';

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { AuthorizationEnv } from '@nocobase/authorization/core';
import {
  defineFileRepositoryApiRoutes,
  type FileRepositoryApiExposure,
} from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import type { RepositoryPolicy } from '@nocobase/db';

/** The exposure name, and the first segment of every file endpoint. */
export const TICKET_FILE_EXPOSURE = 'itTicketFiles';
/** Where the browser reads a screenshot. Matches `ItServiceDeskService`'s `contentUrl`. */
export const TICKET_FILE_ACCESS_PATH = '/uploads/it-ticket-files';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Every authenticated user may upload a screenshot and read file metadata; only the ticket lifecycle decides which
 * tickets reference which files. The content byte route stays public by design: it serves anyone holding the UUID.
 */
const ticketFilePolicy: RepositoryPolicy = {
  read: true,
  create: true,
  update: false,
  delete: false,
};

/**
 * Authentication and authorization for the file exposure. It mounts before the generated file router (array order in
 * `server/routes/index.ts`), so its middleware runs for every `/itTicketFiles/*` request.
 */
export const ticketFileAuthRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono<AuthorizationEnv>();
    const authentication = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    router.use(
      `/${TICKET_FILE_EXPOSURE}`,
      authentication.required(),
      authorization.middleware(),
    );
    router.use(
      `/${TICKET_FILE_EXPOSURE}/*`,
      authentication.required(),
      authorization.middleware(),
    );
    return router as unknown as Hono;
  });

const ticketFileExposures: readonly FileRepositoryApiExposure[] = [
  {
    name: TICKET_FILE_EXPOSURE,
    collection: 'it_ticket_files',
    disk: 'local',
    accessPath: TICKET_FILE_ACCESS_PATH,
    accessMode: 'stream',
    policy: ticketFilePolicy,
    actions: {
      uploadOne: { maxSize: MAX_UPLOAD_BYTES },
      uploadMany: { maxSize: MAX_UPLOAD_BYTES },
      findMany: {},
      findOne: {},
    },
  },
];

/** The generated upload/read endpoints and the public content route. */
export const ticketFileRoutes: readonly AppRouteContribution<Application>[] =
  defineFileRepositoryApiRoutes({ repositories: ticketFileExposures });

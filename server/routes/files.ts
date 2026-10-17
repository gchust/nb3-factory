import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { Application } from '@nocobase/app-server/application';
import {
  FILE_COLUMNS,
  defineFileRepositoryApiRoutes,
} from '@nocobase/app-plugin-file/server';
import { defineApiRoutes, defineRootRoutes } from '@nocobase/app-server/router';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { Hono } from 'hono';
import {
  TICKET_ATTACHMENT_PATH,
  TICKET_ATTACHMENT_REPOSITORY,
  TICKET_FILE_COLLECTION,
} from '../itsm/service.js';

/**
 * The ticket screenshot upload. The file plugin's upload endpoints and the
 * public byte route underneath them carry no authentication of their own, so
 * two guards are mounted ahead of them in `server/routes/index.ts`.
 */

const FILE_FIELDS = [...FILE_COLUMNS];

export const ticketAttachmentApiGuard = defineApiRoutes<Application>((app) => {
  const router = new Hono();
  if (app.container.has(authenticationToken)) {
    router.use(
      `/${TICKET_ATTACHMENT_REPOSITORY}/*`,
      app.container.resolve(authenticationToken).required(),
    );
  }
  return router;
});

export const ticketAttachmentRootGuard = defineRootRoutes<Application>(
  (app) => {
    const router = new Hono();
    if (app.container.has(authenticationToken)) {
      router.use(
        `${TICKET_ATTACHMENT_PATH}/*`,
        app.container.resolve(authenticationToken).required(),
      );
    }
    return router;
  },
);

export const ticketAttachmentRoutes: readonly AppRouteContribution<Application>[] =
  defineFileRepositoryApiRoutes({
    repositories: [
      {
        name: TICKET_ATTACHMENT_REPOSITORY,
        collection: TICKET_FILE_COLLECTION,
        disk: 'local',
        accessPath: TICKET_ATTACHMENT_PATH,
        accessMode: 'stream',
        policy: {
          read: { scope: true, fields: FILE_FIELDS },
          create: { scope: true, fields: FILE_FIELDS },
          update: false,
          delete: false,
        },
        // Upload only. Screenshots are read through the ticket that owns them,
        // which has already applied the caller's scope.
        actions: {
          uploadOne: { maxSize: 5 * 1024 * 1024 },
          uploadMany: { maxSize: 20 * 1024 * 1024 },
        },
      },
    ],
  });

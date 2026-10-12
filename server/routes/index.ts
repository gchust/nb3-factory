import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { AuthEnv } from '@nocobase/app-plugin-authentication/server';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import type { RepositoryPolicy } from '@nocobase/db';
import { Hono } from 'hono';
import type { Context } from 'hono';
import helpdeskRoutes from './helpdesk.js';

/**
 * A guard that runs before the file plugin's own contributions, so its upload endpoints require a session. The
 * plugin's routes are deliberately application-owned and unauthenticated out of the box; this is where the
 * application adds the one thing it owes them. The byte route that serves a file's content is mounted at the
 * application root, not under `/api`, and stays readable by anyone holding its UUID.
 */
const attachmentGuard: AppRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    // The authentication plugin is a built-in of the real application; a runtime composed without it contributes no
    // guard rather than failing route registration.
    if (!app.container.has(authenticationToken)) return router;
    const auth = app.container.resolve(authenticationToken);
    router.use('/ticketAttachments/*', auth.required());
    return router;
  },
);

/**
 * The screenshot exposure. `ticketAttachments` is the file plugin's file-record collection, so uploads go through
 * the plugin's `uploadOne`/`uploadMany`; the exposure's Policy stamps the uploader and leaves reads open to a
 * signed-in caller, because the id is what a ticket references and the content route is public by UUID anyway.
 * `disk` is the configured default from `server/config/drive.ts`.
 */
const attachmentPolicy = (uploadedById: string | null): RepositoryPolicy => ({
  read: true,
  create: {
    scope: true,
    fields: [],
    defaults: uploadedById === null ? {} : { uploadedById },
  },
  update: { scope: true, fields: [] },
  delete: { scope: true },
});

const ticketAttachmentRoutes = defineFileRepositoryApiRoutes({
  principal: (context) =>
    (context as Context<AuthEnv>).get('auth')?.user?.id ?? null,
  repositories: [
    {
      name: 'ticketAttachments',
      collection: 'ticketAttachments',
      disk: 'local',
      policy: attachmentPolicy,
      actions: { uploadOne: {}, uploadMany: {} },
    },
  ],
});

const routes: readonly AppRouteContribution<Application>[] = [
  attachmentGuard,
  helpdeskRoutes,
  ...ticketAttachmentRoutes,
];

export default routes;

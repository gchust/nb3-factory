import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';

/**
 * Repair attachments: PNG photos and DOCX reports stored on the `local` disk
 * under `ticket_files`, served at `/uploads/tickets/<uuid>.<ext>`.
 *
 * The policy is deliberately narrow: uploads only, no listing through the file
 * plugin. Listing, linking and removal are the ticket routes' job, which
 * enforce the ticket's own ownership and sharing rules. Both the
 * `/api/ticketAttachments/*` session requirement and the `/uploads/tickets/*`
 * read guard are registered by `EquipmentServiceProvider`, because
 * `addHttpMiddleware` has to run before the plugin's routers.
 */
export const attachmentRoutes: readonly AppRouteContribution<Application>[] =
  defineFileRepositoryApiRoutes({
    repositories: [
      {
        name: 'ticketAttachments',
        collection: 'ticket_files',
        connection: 'main',
        disk: 'local',
        accessPath: '/uploads/tickets',
        accessMode: 'stream',
        policy: {
          read: false,
          create: true,
          update: false,
          delete: false,
        },
        actions: {
          uploadOne: { maxSize: 30 * 1024 * 1024 },
          uploadMany: { maxSize: 30 * 1024 * 1024 },
        },
      },
    ],
  });

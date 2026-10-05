/**
 * Exposes the File Repository for work-order evidence.
 *
 * Only the upload action is published. The plugin's upload, storage and
 * metadata handling is reused as-is; the App owns the collection, the disk and
 * the authentication. The policy is deliberately static because the business
 * rule deciding who may *link* a file to a work order lives in
 * `ServiceOperations.registerAttachment`, not here — an upload creates an
 * unattached file row, and attaching it is a separate, authorized action.
 *
 * No read action is published: the plugin's own byte route and its list routes
 * have no business permission model, and evidence must stay scoped to the work
 * order it belongs to. Files are read through the App's authenticated
 * `GET /api/service/attachments/:id/content` instead, and removed through
 * `DELETE /api/service/work-orders/:id/attachments/:fileId`, which deletes the
 * row and records the removal on the work order.
 *
 * Every path this exposure creates is guarded by `serviceAttachmentGuard`.
 */
import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';

export const serviceAttachmentRoutes: readonly AppRouteContribution<Application>[] =
  defineFileRepositoryApiRoutes({
    repositories: [
      {
        name: 'serviceWorkOrderFiles',
        collection: 'serviceWorkOrderFiles',
        connection: 'main',
        disk: 'local',
        accessPath: '/service-attachments',
        accessMode: 'stream',
        policy: {
          read: false,
          create: { scope: true },
          update: false,
          delete: false,
        },
        actions: {
          uploadOne: { maxSize: 20 * 1024 * 1024 },
        },
      },
    ],
  });

export default serviceAttachmentRoutes;

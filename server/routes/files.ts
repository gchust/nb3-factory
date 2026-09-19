import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import {
  PROCUREMENT_FILE_ACCESS_PATH,
  PROCUREMENT_FILE_COLLECTION,
  PROCUREMENT_FILE_DISK,
  PROCUREMENT_FILE_RESOURCE,
} from '../providers/procurement-service.js';

/**
 * The upload surface for procurement attachments.
 *
 * Only the two upload actions are exposed. Listing, linking and removing go
 * through the procurement API instead, because those operations depend on the
 * owning document's permission and the repository actions know nothing about
 * it. Authentication for both upload actions and the content route is applied
 * by the procurement provider, not here.
 */
const fileRoutes: readonly AppRouteContribution<Application>[] =
  defineFileRepositoryApiRoutes({
    repositories: [
      {
        name: PROCUREMENT_FILE_RESOURCE,
        collection: PROCUREMENT_FILE_COLLECTION,
        connection: 'main',
        disk: PROCUREMENT_FILE_DISK,
        accessPath: PROCUREMENT_FILE_ACCESS_PATH,
        accessMode: 'stream',
        policy: {
          // An upload is a write, so `create` has to allow it; a node without a
          // field allowlist is what lets the caller supply nothing but the file.
          read: false,
          create: { scope: true },
          update: false,
          delete: false,
        },
        actions: {
          uploadOne: { maxSize: 5 * 1024 * 1024 },
          // Five files of 5 MiB plus multipart overhead.
          uploadMany: { maxSize: 26 * 1024 * 1024 },
        },
      },
    ],
  });

export default fileRoutes;

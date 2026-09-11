import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppApiRouteContribution,
  type AppRootRouteContribution,
} from '@nocobase/app-server/router';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  defineFileRepositoryApiRoutes,
  type FileRepositoryApiExposure,
} from '@nocobase/app-plugin-file/server';
import { Hono } from 'hono';

import { FILE_ACCESS_PATHS } from '../providers/equipment-inspection.js';

/**
 * File repository API and content routes for the equipment archive.
 *
 * The file plugin deliberately leaves authentication to the application, so
 * both the repository CRUD/upload API and the content (/uploads/...) streaming
 * routes are wrapped here with session authentication. Uploads happen while the
 * linked business record does not exist yet (equipmentId / inspectionRecordId
 * null); the business API links them on save.
 */
const repositories: readonly FileRepositoryApiExposure[] = [
  {
    name: 'equipmentMainImages',
    connection: 'main',
    disk: 'local',
    accessPath: FILE_ACCESS_PATHS.mainImage,
    accessMode: 'stream',
    actions: {
      findMany: { maxLimit: 200 },
      findOne: {},
      deleteOne: {},
      uploadOne: { maxSize: 10 * 1024 * 1024 },
      uploadMany: { maxSize: 50 * 1024 * 1024 },
    },
  },
  {
    name: 'equipmentDocuments',
    connection: 'main',
    disk: 'local',
    accessPath: FILE_ACCESS_PATHS.document,
    accessMode: 'stream',
    actions: {
      findMany: { maxLimit: 200 },
      findOne: {},
      deleteOne: {},
      uploadOne: { maxSize: 10 * 1024 * 1024 },
      uploadMany: { maxSize: 50 * 1024 * 1024 },
    },
  },
  {
    name: 'inspectionPhotos',
    connection: 'main',
    disk: 'local',
    accessPath: FILE_ACCESS_PATHS.photo,
    accessMode: 'stream',
    actions: {
      findMany: { maxLimit: 200 },
      findOne: {},
      deleteOne: {},
      uploadOne: { maxSize: 10 * 1024 * 1024 },
      uploadMany: { maxSize: 50 * 1024 * 1024 },
    },
  },
];

const [fileApiContribution, fileRootContribution] =
  defineFileRepositoryApiRoutes({ repositories });

export const fileApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes<Application>(async (app) => {
    const router = new Hono();
    const required = app.container.resolve(authenticationToken).required();
    // Authentication guards are scoped to the exact paths this contribution
    // owns. Contributions are flattened onto the shared application router at
    // their scope root (/api for API routes, / for root routes), so a bare
    // `use('*', ...)` guard here would intercept every /api/* or /* request —
    // including the public sign-in API and the SPA index — and return 401
    // before those routes can run.
    for (const entry of repositories) {
      for (const action of Object.keys(entry.actions)) {
        // Mirrors the route patterns the file plugin registers for each
        // action (`/equipmentMainImages:findMany`, ...).
        router.use(`/${encodeURIComponent(entry.name)}:${action}`, required);
      }
    }
    router.route('/', await fileApiContribution.createRouter(app));
    return router;
  });

export const fileRootRoutes: AppRootRouteContribution<Application> =
  defineRootRoutes<Application>(async (app) => {
    const router = new Hono();
    const required = app.container.resolve(authenticationToken).required();
    // Guard only the file content streaming paths; a catch-all here would
    // intercept the SPA index and every public page with 401.
    for (const accessPath of Object.values(FILE_ACCESS_PATHS)) {
      router.use(`${accessPath}/*`, required);
    }
    router.route('/', await fileRootContribution.createRouter(app));
    return router;
  });

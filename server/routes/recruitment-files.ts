import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import { Hono } from 'hono';

import {
  CANDIDATE_FILE_ACCESS_PATH,
  CANDIDATE_FILE_COLLECTION,
  RecruitmentError,
} from '../providers/recruitment.js';
import { createRecruitmentServiceForApp } from './recruitment-context.js';

/**
 * Candidate attachment HTTP surface.
 *
 * The File Repository owns upload, storage, metadata and byte streaming. This
 * module adds the two guarantees the plugin deliberately leaves to the
 * application: every upload path requires a signed-in account with a
 * recruitment role, and every content path re-checks that the caller may see
 * the record the file is attached to. Middleware is scoped to the paths this
 * contribution owns, so it never guards the SPA or another contribution.
 */
export function createRecruitmentFileRoutes(): AppRouteContribution<Application>[] {
  const [fileApi, fileContent] = defineFileRepositoryApiRoutes({
    repositories: [
      {
        name: CANDIDATE_FILE_COLLECTION,
        collection: CANDIDATE_FILE_COLLECTION,
        disk: 'local',
        accessPath: CANDIDATE_FILE_ACCESS_PATH,
        accessMode: 'stream',
        policy: {
          // Reads and deletes go through the recruitment API, which scopes them
          // to the candidate; only a permission-checked upload is exposed here.
          read: false,
          create: { scope: true },
          update: false,
          delete: false,
        },
        actions: {
          // A 5 MB file plus multipart overhead. Per-file size is enforced by
          // the upload control and re-checked when the file is linked.
          uploadOne: { maxSize: 6 * 1024 * 1024 },
          uploadMany: { maxSize: 26 * 1024 * 1024 },
        },
      },
    ],
  });

  const guardedApi: AppRouteContribution<Application> = defineApiRoutes(
    async (app) => {
      const outer = new Hono();
      const guard = new Hono<AuthEnv>();
      const auth = app.container.resolve(authenticationToken);
      const service = createRecruitmentServiceForApp(app);
      const path = `/${CANDIDATE_FILE_COLLECTION}*`;
      guard.use(path, auth.required());
      guard.use(path, async (context, next) => {
        const userId = context.get('auth')?.user?.id;
        if (!userId) return context.json({ code: 'UNAUTHENTICATED' }, 401);
        const actor = await service.resolveActor(String(userId));
        if (actor.role === 'none') {
          return context.json({ code: 'FORBIDDEN' }, 403);
        }
        await next();
      });
      outer.route('/', guard);
      outer.route('/', await fileApi.createRouter(app));
      return outer;
    },
  );

  const guardedContent: AppRouteContribution<Application> = defineRootRoutes(
    async (app) => {
      const outer = new Hono();
      const guard = new Hono<AuthEnv>();
      const auth = app.container.resolve(authenticationToken);
      const service = createRecruitmentServiceForApp(app);
      const path = `${CANDIDATE_FILE_ACCESS_PATH}/*`;
      guard.use(path, auth.required());
      guard.use(path, async (context, next) => {
        const userId = context.get('auth')?.user?.id;
        if (!userId) return context.json({ code: 'UNAUTHENTICATED' }, 401);
        const actor = await service.resolveActor(String(userId));
        const fileId = fileIdFromPath(context.req.path);
        if (!fileId) return context.json({ code: 'NOT_FOUND' }, 404);
        try {
          await service.assertFileContentAccess(actor, fileId);
        } catch (error: unknown) {
          if (error instanceof RecruitmentError) {
            return context.json(
              { code: error.code, error: error.message },
              error.status as 400,
            );
          }
          throw error;
        }
        await next();
      });
      outer.route('/', guard);
      outer.route('/', await fileContent.createRouter(app));
      return outer;
    },
  );

  return [guardedApi, guardedContent];
}

function fileIdFromPath(path: string): string | undefined {
  const match = new RegExp(
    `${CANDIDATE_FILE_ACCESS_PATH}/([0-9a-fA-F-]{36})(?:\\.[a-z0-9]{1,32})?$`,
    'u',
  ).exec(path);
  return match?.[1];
}

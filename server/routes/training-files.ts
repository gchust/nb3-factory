import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { defineFileRepositoryApiRoutes } from '@nocobase/app-plugin-file/server';
import { Hono, type Context } from 'hono';

import {
  TRAINING_FILE_ACCESS_PATH,
  TRAINING_FILE_MAX_COUNT,
  TRAINING_FILE_MAX_SIZE,
  TRAINING_FILE_RESOURCE,
  trainingServiceToken,
  type TrainingService,
} from '../providers/index.js';
import { resolveViewer } from './training.js';

/** Matches the `/<uuid>` and `/<uuid>.<ext>` names the content route serves. */
const FILE_NAME =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.([a-z0-9]{1,32}))?$/;

/** The principal shape the File Repository exposure's Policy is built from. */
interface FilePrincipal {
  readonly userId: string;
}

/**
 * Authentication for the File Repository paths this application exposes.
 *
 * The generated routes carry no authentication of their own, so this
 * contribution is mounted before them and guards exactly the paths it owns:
 * the upload and delete actions under `/api`, and the byte route under the
 * access path. That byte route is public by default; the guard refuses an
 * address the caller has no business relationship with.
 */
export const trainingFileGuards: readonly AppRouteContribution<Application>[] =
  [
    defineApiRoutes((app) => {
      const router = new Hono();
      const routes = new Hono<AuthEnv>();
      const auth = app.container.resolve(authenticationToken);
      for (const action of ['uploadOne', 'uploadMany', 'deleteOne']) {
        routes.use(`/${TRAINING_FILE_RESOURCE}:${action}`, auth.required());
      }
      router.route('/', routes);
      return router;
    }),
    defineRootRoutes((app) => {
      const router = new Hono();
      const routes = new Hono<AuthEnv>();
      const auth = app.container.resolve(authenticationToken);
      const authorization = app.container.resolve(authorizationToken);
      const training =
        app.container.resolve<TrainingService>(trainingServiceToken);
      routes.use(
        `${TRAINING_FILE_ACCESS_PATH}/:file`,
        auth.required(),
        async (context, next) => {
          const session = context.get('auth');
          const match = FILE_NAME.exec(context.req.param('file') ?? '');
          if (!session) {
            return context.json(
              { code: 'UNAUTHORIZED', message: '请先登录' },
              401,
            );
          }
          if (!match) {
            return context.json(
              { code: 'NOT_FOUND', message: '文件不存在' },
              404,
            );
          }
          const viewer = await resolveViewer(authorization, session.user.id);
          if (!(await training.canAccessFile(viewer, match[1]))) {
            return context.json(
              { code: 'FORBIDDEN', message: '无权访问该文件' },
              403,
            );
          }
          await next();
          return undefined;
        },
      );
      router.route('/', routes);
      return router;
    }),
  ];

/**
 * The File Repository exposure for training files.
 *
 * Uploads are stamped with the uploader through the Policy defaults, so a file
 * is always readable by whoever uploaded it; delete is scoped the same way.
 */
export const trainingFileRoutes: readonly AppRouteContribution<Application>[] =
  defineFileRepositoryApiRoutes<FilePrincipal>({
    // The plugin treats a missing principal as a refusal at runtime, but its
    // declared type does not admit `undefined`; keep the honest return type.
    principal: principalFromContext as unknown as (
      context: Context,
    ) => FilePrincipal,
    repositories: [
      {
        name: TRAINING_FILE_RESOURCE,
        collection: TRAINING_FILE_RESOURCE,
        connection: 'main',
        disk: 'local',
        accessPath: TRAINING_FILE_ACCESS_PATH,
        accessMode: 'stream',
        policy: (principal) => ({
          // The interface reads file metadata through the training API, which
          // applies the business relation; the Repository read actions stay shut.
          read: false,
          create: {
            scope: true,
            defaults: { uploadedById: principal.userId },
          },
          update: false,
          delete: {
            scope: (filter) =>
              filter.string('uploadedById').eq(principal.userId),
          },
        }),
        actions: {
          deleteOne: {},
          uploadOne: { maxSize: TRAINING_FILE_MAX_SIZE },
          uploadMany: {
            maxSize:
              TRAINING_FILE_MAX_SIZE * TRAINING_FILE_MAX_COUNT + 1024 * 1024,
          },
        },
      },
    ],
  });

function principalFromContext(context: Context): FilePrincipal | undefined {
  const session = (context as Context<AuthEnv>).get('auth');
  if (!session?.user?.id) return undefined;
  return { userId: session.user.id };
}

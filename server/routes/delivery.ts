import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';

import { deliveryServiceToken } from '../providers/delivery-provider.js';
import { resolveDeliveryActor } from '../providers/delivery-roles.js';
import {
  DELIVERY_FILE_REQUIRED,
  DELIVERY_FILE_TOO_LARGE,
  DELIVERY_NOT_FOUND,
  DeliveryRuleError,
  parseIdentifier,
  requireIdentifier,
  validationError,
} from '../providers/delivery-rules.js';
import {
  assertCanManage,
  type DeliveryActor,
  type DeliveryService,
} from '../providers/delivery-service.js';

const FILE_COLLECTION = 'deliveryProjectFiles';
const FILE_DISK = 'local';
const FILE_ACCESS_PATH = '/delivery-files';
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function contentUrl(app: Application, fileId: string): string {
  return `${app.publicBasePath}/api/delivery-files/${fileId}/content`;
}

function handle(
  run: (context: Context<AuthEnv>) => Promise<Response>,
): (context: Context<AuthEnv>) => Promise<Response> {
  return async (context) => {
    try {
      return await run(context);
    } catch (error) {
      if (error instanceof DeliveryRuleError) {
        return context.json(
          { error: { code: error.code, message: error.message } },
          error.status as 400,
        );
      }
      throw error;
    }
  };
}

async function readJson(
  context: Context<AuthEnv>,
): Promise<Record<string, unknown>> {
  try {
    const body = await context.req.json<unknown>();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw validationError('A JSON object body is required');
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof DeliveryRuleError) throw error;
    throw validationError('A valid JSON body is required');
  }
}

function createDeliveryRouter(app: Application): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();
  const auth = app.container.resolve(authenticationToken);
  const authorization = app.container.resolve(authorizationToken);
  const service = app.container.resolve<DeliveryService>(deliveryServiceToken);

  router.use('*', auth.required());

  const actorFor = async (
    context: Context<AuthEnv>,
  ): Promise<DeliveryActor> => {
    const session = context.get('auth');
    if (!session?.user?.id) {
      throw new DeliveryRuleError(
        'DELIVERY_UNAUTHENTICATED',
        'Authentication required',
        401,
      );
    }
    return resolveDeliveryActor(authorization.permissionSets, session.user.id);
  };

  router.get(
    '/me',
    handle(async (context) => {
      const actor = await actorFor(context);
      return context.json({ data: actor });
    }),
  );

  router.get(
    '/members',
    handle(async (context) => {
      await actorFor(context);
      return context.json({ data: await service.listMembers() });
    }),
  );

  // ------------------------------------------------------------- projects

  router.get(
    '/projects',
    handle(async (context) => {
      await actorFor(context);
      const status = context.req.query('status');
      return context.json({ data: await service.listProjects(status) });
    }),
  );

  router.post(
    '/projects',
    handle(async (context) => {
      const actor = await actorFor(context);
      assertCanManage(actor.role);
      const project = await service.createProject(await readJson(context));
      return context.json({ data: project }, 201);
    }),
  );

  router.get(
    '/projects/:id',
    handle(async (context) => {
      await actorFor(context);
      const id = requireIdentifier(context.req.param('id'), 'id');
      return context.json({ data: await service.getProject(id) });
    }),
  );

  router.patch(
    '/projects/:id',
    handle(async (context) => {
      const actor = await actorFor(context);
      assertCanManage(actor.role);
      const id = requireIdentifier(context.req.param('id'), 'id');
      return context.json({
        data: await service.updateProject(id, await readJson(context)),
      });
    }),
  );

  router.delete(
    '/projects/:id',
    handle(async (context) => {
      const actor = await actorFor(context);
      assertCanManage(actor.role);
      const id = requireIdentifier(context.req.param('id'), 'id');
      const { fileIds } = await service.deleteProject(id);
      const files = await service.removeFileMetadata(fileIds);
      await removeObjects(app, files);
      return context.json({ data: { deleted: true } });
    }),
  );

  router.get(
    '/projects/:id/attachments',
    handle(async (context) => {
      await actorFor(context);
      const id = requireIdentifier(context.req.param('id'), 'id');
      const attachments = (await service.listAttachments(id)).map((item) => ({
        ...item,
        contentUrl: contentUrl(app, item.id),
      }));
      return context.json({ data: attachments });
    }),
  );

  router.post(
    '/projects/:id/attachments',
    handle(async (context) => {
      const actor = await actorFor(context);
      assertCanManage(actor.role);
      const id = requireIdentifier(context.req.param('id'), 'id');
      const body = await context.req.parseBody();
      const file = body.file;
      if (!(file instanceof File)) {
        throw new DeliveryRuleError(
          DELIVERY_FILE_REQUIRED,
          'A file is required',
          400,
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new DeliveryRuleError(
          DELIVERY_FILE_TOO_LARGE,
          'The file exceeds the 10 MB limit',
          413,
        );
      }
      const manager = app.container.resolve(serverFileRepositoryManagerToken);
      const repository = manager.repository(FILE_COLLECTION, {
        connection: 'main',
        disk: FILE_DISK,
        accessPath: FILE_ACCESS_PATH,
      });
      const { record } = await repository.uploadOne({ file });
      await service.linkAttachment(id, record.id);
      return context.json(
        {
          data: {
            id: record.id,
            filename: record.filename,
            mimeType: record.mimeType,
            size: record.size,
            createdAt: new Date().toISOString(),
            contentUrl: contentUrl(app, record.id),
          },
        },
        201,
      );
    }),
  );

  router.delete(
    '/projects/:id/attachments/:fileId',
    handle(async (context) => {
      const actor = await actorFor(context);
      assertCanManage(actor.role);
      const id = requireIdentifier(context.req.param('id'), 'id');
      const fileId = context.req.param('fileId') ?? '';
      const removed = await service.unlinkAttachment(id, fileId);
      if (removed) await removeObjects(app, [removed]);
      return context.json({ data: { deleted: true } });
    }),
  );

  // ----------------------------------------------------------- milestones

  router.get(
    '/milestones',
    handle(async (context) => {
      await actorFor(context);
      const projectId = parseIdentifier(
        context.req.query('projectId'),
        'projectId',
      );
      return context.json({
        data: await service.listMilestones(projectId ?? undefined),
      });
    }),
  );

  router.post(
    '/milestones',
    handle(async (context) => {
      const actor = await actorFor(context);
      assertCanManage(actor.role);
      return context.json(
        { data: await service.createMilestone(await readJson(context)) },
        201,
      );
    }),
  );

  router.patch(
    '/milestones/:id',
    handle(async (context) => {
      const actor = await actorFor(context);
      assertCanManage(actor.role);
      const id = requireIdentifier(context.req.param('id'), 'id');
      return context.json({
        data: await service.updateMilestone(id, await readJson(context)),
      });
    }),
  );

  router.delete(
    '/milestones/:id',
    handle(async (context) => {
      const actor = await actorFor(context);
      assertCanManage(actor.role);
      const id = requireIdentifier(context.req.param('id'), 'id');
      await service.deleteMilestone(id);
      return context.json({ data: { deleted: true } });
    }),
  );

  // ---------------------------------------------------------------- tasks

  router.get(
    '/tasks',
    handle(async (context) => {
      await actorFor(context);
      const projectId = parseIdentifier(
        context.req.query('projectId'),
        'projectId',
      );
      const milestoneId = parseIdentifier(
        context.req.query('milestoneId'),
        'milestoneId',
      );
      const assigneeId = context.req.query('assigneeId') || undefined;
      return context.json({
        data: await service.listTasks({
          projectId: projectId ?? undefined,
          milestoneId: milestoneId ?? undefined,
          assigneeId,
        }),
      });
    }),
  );

  router.post(
    '/tasks',
    handle(async (context) => {
      const actor = await actorFor(context);
      assertCanManage(actor.role);
      return context.json(
        {
          data: await service.createTask(await readJson(context), actor.userId),
        },
        201,
      );
    }),
  );

  router.patch(
    '/tasks/:id',
    handle(async (context) => {
      const actor = await actorFor(context);
      const id = requireIdentifier(context.req.param('id'), 'id');
      return context.json({
        data: await service.updateTask(id, await readJson(context), actor),
      });
    }),
  );

  router.delete(
    '/tasks/:id',
    handle(async (context) => {
      const actor = await actorFor(context);
      assertCanManage(actor.role);
      const id = requireIdentifier(context.req.param('id'), 'id');
      await service.deleteTask(id);
      return context.json({ data: { deleted: true } });
    }),
  );

  // ----------------------------------------------------------- timesheets

  router.get(
    '/timesheets',
    handle(async (context) => {
      const actor = await actorFor(context);
      const taskId = parseIdentifier(context.req.query('taskId'), 'taskId');
      const projectId = parseIdentifier(
        context.req.query('projectId'),
        'projectId',
      );
      const userId = context.req.query('userId') || undefined;
      return context.json({
        data: await service.listTimesheets(
          {
            taskId: taskId ?? undefined,
            projectId: projectId ?? undefined,
            userId,
          },
          actor,
        ),
      });
    }),
  );

  router.post(
    '/timesheets',
    handle(async (context) => {
      const actor = await actorFor(context);
      return context.json(
        {
          data: await service.createTimesheet(await readJson(context), actor),
        },
        201,
      );
    }),
  );

  router.patch(
    '/timesheets/:id',
    handle(async (context) => {
      const actor = await actorFor(context);
      const id = requireIdentifier(context.req.param('id'), 'id');
      return context.json({
        data: await service.updateTimesheet(id, await readJson(context), actor),
      });
    }),
  );

  router.delete(
    '/timesheets/:id',
    handle(async (context) => {
      const actor = await actorFor(context);
      const id = requireIdentifier(context.req.param('id'), 'id');
      await service.deleteTimesheet(id, actor);
      return context.json({ data: { deleted: true } });
    }),
  );

  // ----------------------------------------------------------- dashboard

  router.get(
    '/dashboard',
    handle(async (context) => {
      const actor = await actorFor(context);
      return context.json({ data: await service.dashboard(actor) });
    }),
  );

  return router;
}

function createDeliveryFileRouter(app: Application): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();
  const auth = app.container.resolve(authenticationToken);
  const service = app.container.resolve<DeliveryService>(deliveryServiceToken);

  router.use('*', auth.required());

  router.get(
    '/:fileId/content',
    handle(async (context) => {
      const fileId = context.req.param('fileId') ?? '';
      const file = await service.findAttachmentFile(fileId);
      if (!file) {
        return context.json(
          {
            error: {
              code: DELIVERY_NOT_FOUND,
              message: 'Attachment not found',
            },
          },
          404,
        );
      }
      const drive = app.container.resolve(driveManagerToken);
      const bytes = await drive.use(file.disk).getBytes(file.key);
      const buffer = new ArrayBuffer(bytes.byteLength);
      const body = new Uint8Array(buffer);
      body.set(bytes);
      const asciiName = file.filename
        .replace(/[^\x20-\x7e]/g, '_')
        .replace(/["\\]/g, '_');
      return context.body(body, 200, {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        'Cache-Control': 'private, max-age=0, must-revalidate',
      });
    }),
  );

  return router;
}

async function removeObjects(
  app: Application,
  files: readonly { disk: string; key: string }[],
): Promise<void> {
  if (files.length === 0) return;
  const drive = app.container.resolve(driveManagerToken);
  for (const file of files) {
    try {
      await drive.use(file.disk).delete(file.key);
    } catch {
      // The metadata is already gone; a missing object needs no further cleanup.
    }
  }
}

export const deliveryApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    router.route('/delivery', createDeliveryRouter(app));
    router.route('/delivery-files', createDeliveryFileRouter(app));
    return router;
  });

export default deliveryApiRoutes;

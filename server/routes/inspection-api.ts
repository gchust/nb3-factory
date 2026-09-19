import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type Context } from 'hono';

import {
  BusinessError,
  InspectionService,
  ROLE_EQUIPMENT_MANAGER,
  ROLE_INSPECTOR,
  ROLE_REPAIRER,
  ROLE_SYSTEM_ADMINISTRATOR,
  type Actor,
  type NewEquipmentInput,
  type NewTaskInput,
  type NewTemplateInput,
  type ResultEntryInput,
} from '../providers/inspection-service.js';
import { MAX_UPLOAD_FILES, parseUploadedFiles } from './upload-files.js';

const APP_ROLES = [
  ROLE_SYSTEM_ADMINISTRATOR,
  ROLE_EQUIPMENT_MANAGER,
  ROLE_INSPECTOR,
  ROLE_REPAIRER,
] as const;

export const inspectionApiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const files = app.container.resolve(serverFileRepositoryManagerToken);
    const drive = app.container.resolve(driveManagerToken);
    const service = new InspectionService(database);
    const repository = files.repository('appFiles', {
      disk: 'local',
      accessPath: '/app-files',
      policy: { read: true, create: true, update: false, delete: false },
    });

    async function actorOf(context: Context<AuthorizationEnv>): Promise<Actor> {
      const scope = context.get('authz');
      const userId = scope.identity.principal.id;
      const assignments = await authorization.permissionSets.listAssignments();
      const roles = new Set(
        assignments
          .filter(
            (assignment) =>
              assignment.subject.type === 'user' &&
              assignment.subject.id === userId,
          )
          .map((assignment) => assignment.permissionSet),
      );
      return { userId, roles };
    }

    /** Users holding an application permission set, resolved from assignments. */
    async function userIdsForPermissionSet(
      permissionSet: string,
    ): Promise<string[]> {
      const assignments = await authorization.permissionSets.listAssignments();
      return assignments
        .filter(
          (item) =>
            item.subject.type === 'user' &&
            item.permissionSet === permissionSet,
        )
        .map((item) => item.subject.id);
    }

    function hasAppRole(actor: Actor): boolean {
      return APP_ROLES.some((role) => actor.roles.has(role));
    }

    function requireAppRole(actor: Actor): void {
      if (!hasAppRole(actor)) {
        throw new BusinessError('FORBIDDEN', '没有访问该业务模块的权限。', 403);
      }
    }

    function onError(
      error: Error,
      context: Context<AuthorizationEnv>,
    ): Response {
      if (error instanceof BusinessError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status as 400,
        );
      }
      throw error;
    }

    function routes(): Hono<AuthorizationEnv> {
      const sub = new Hono<AuthorizationEnv>();
      sub.use('*', auth.required(), authorization.middleware());
      sub.onError((error, context) => onError(error, context));
      return sub;
    }

    function json(
      context: Context<AuthorizationEnv>,
      data: unknown,
      status: 200 | 201 = 200,
    ): Response {
      return context.json({ data }, status);
    }

    async function uploadAll(input: readonly File[]) {
      const stored = [];
      for (const file of input) {
        const { record } = await repository.uploadOne({ file });
        stored.push({
          id: String(record.id),
          filename: String(record.filename),
          mimeType: String(record.mimeType),
          size: record.size,
          ext: String(record.ext),
        });
      }
      return stored;
    }

    // ------------------------------------------------------------- equipment

    const equipment = routes();
    equipment.get('/', async (context) => {
      const actor = await actorOf(context);
      requireAppRole(actor);
      return json(context, await service.listEquipment());
    });
    equipment.get('/:id', async (context) => {
      const actor = await actorOf(context);
      requireAppRole(actor);
      return json(
        context,
        await service.getEquipment(Number(context.req.param('id'))),
      );
    });
    equipment.post('/', async (context) => {
      const actor = await actorOf(context);
      return json(
        context,
        await service.createEquipment(
          actor,
          await context.req.json<NewEquipmentInput>(),
        ),
        201,
      );
    });
    equipment.patch('/:id', async (context) => {
      const actor = await actorOf(context);
      return json(
        context,
        await service.updateEquipment(
          actor,
          Number(context.req.param('id')),
          await context.req.json<NewEquipmentInput>(),
        ),
      );
    });
    equipment.delete('/:id', async (context) => {
      const actor = await actorOf(context);
      await service.deleteEquipment(actor, Number(context.req.param('id')));
      return context.body(null, 204);
    });
    equipment.post('/:id/photo', async (context) => {
      const actor = await actorOf(context);
      const uploaded = await uploadAll(
        await parseUploadedFiles(context.req, { maxFiles: 1 }),
      );
      return json(
        context,
        await service.setEquipmentPhoto(
          actor,
          Number(context.req.param('id')),
          uploaded[0]?.id ?? null,
        ),
      );
    });
    equipment.delete('/:id/photo', async (context) => {
      const actor = await actorOf(context);
      return json(
        context,
        await service.setEquipmentPhoto(
          actor,
          Number(context.req.param('id')),
          null,
        ),
      );
    });

    // ------------------------------------------------------------- templates

    const templates = routes();
    templates.get('/', async (context) => {
      const actor = await actorOf(context);
      requireAppRole(actor);
      return json(context, await service.listTemplates());
    });
    templates.post('/', async (context) => {
      const actor = await actorOf(context);
      return json(
        context,
        await service.createTemplate(
          actor,
          await context.req.json<NewTemplateInput>(),
        ),
        201,
      );
    });
    templates.patch('/:id', async (context) => {
      const actor = await actorOf(context);
      return json(
        context,
        await service.updateTemplate(
          actor,
          Number(context.req.param('id')),
          await context.req.json<NewTemplateInput>(),
        ),
      );
    });
    templates.delete('/:id', async (context) => {
      const actor = await actorOf(context);
      await service.deleteTemplate(actor, Number(context.req.param('id')));
      return context.body(null, 204);
    });

    // ------------------------------------------------------------ inspections

    const inspections = routes();
    inspections.get('/people', async (context) => {
      const actor = await actorOf(context);
      if (!(
        actor.roles.has(ROLE_SYSTEM_ADMINISTRATOR) ||
        actor.roles.has(ROLE_EQUIPMENT_MANAGER)
      )) {
        throw new BusinessError(
          'FORBIDDEN',
          '只有设备管理员可以查看分派人员。',
          403,
        );
      }
      const inspectorIds = new Set(await userIdsForPermissionSet('inspector'));
      const repairerIds = new Set(await userIdsForPermissionSet('repairer'));
      const users = await database
        .query()
        .selectFrom('user')
        .select(['id', 'name', 'username'])
        .orderBy('name', 'asc')
        .execute();
      const toOption = (row: Record<string, unknown>) => ({
        id: String(row.id),
        name: String(row.name ?? row.username ?? row.id),
      });
      return json(context, {
        inspectors: users
          .filter((row) => inspectorIds.has(String(row.id)))
          .map(toOption),
        repairers: users
          .filter((row) => repairerIds.has(String(row.id)))
          .map(toOption),
      });
    });
    inspections.get('/', async (context) => {
      const actor = await actorOf(context);
      requireAppRole(actor);
      return json(context, await service.listTasks(actor));
    });
    inspections.post('/', async (context) => {
      const actor = await actorOf(context);
      return json(
        context,
        await service.createTask(actor, await context.req.json<NewTaskInput>()),
        201,
      );
    });
    inspections.post('/files/:attachmentId/remove', async (context) => {
      const actor = await actorOf(context);
      await service.removeInspectionAttachment(
        actor,
        Number(context.req.param('attachmentId')),
      );
      return context.body(null, 204);
    });
    inspections.get('/:id', async (context) => {
      const actor = await actorOf(context);
      return json(
        context,
        await service.getTask(actor, Number(context.req.param('id'))),
      );
    });
    inspections.put('/:id/results', async (context) => {
      const actor = await actorOf(context);
      const body = await context.req.json<{ results?: unknown }>();
      await service.saveTaskResults(
        actor,
        Number(context.req.param('id')),
        Array.isArray(body.results) ? (body.results as ResultEntryInput[]) : [],
      );
      return json(context, { saved: true });
    });
    inspections.post('/:id/submit', async (context) => {
      const actor = await actorOf(context);
      // New repair orders go straight to a repairer so the maintenance side
      // receives them without a separate manager assignment step.
      return json(
        context,
        await service.submitTask(actor, Number(context.req.param('id')), {
          defaultAssigneeIds: await userIdsForPermissionSet('repairer'),
        }),
      );
    });
    inspections.delete('/:id', async (context) => {
      const actor = await actorOf(context);
      await service.deleteTask(actor, Number(context.req.param('id')));
      return context.body(null, 204);
    });
    inspections.post('/:taskId/results/:resultId/files', async (context) => {
      const actor = await actorOf(context);
      const uploaded = await uploadAll(
        await parseUploadedFiles(context.req, { maxFiles: MAX_UPLOAD_FILES }),
      );
      const note = context.req.query('note') ?? null;
      await service.addInspectionFiles(
        actor,
        Number(context.req.param('taskId')),
        Number(context.req.param('resultId')),
        uploaded,
        note,
      );
      return json(context, { uploaded: uploaded.length }, 201);
    });

    // ---------------------------------------------------------------- repairs

    const repairs = routes();
    repairs.get('/', async (context) => {
      const actor = await actorOf(context);
      requireAppRole(actor);
      return json(context, await service.listRepairs(actor));
    });
    repairs.post('/files/:attachmentId/remove', async (context) => {
      const actor = await actorOf(context);
      await service.removeRepairAttachment(
        actor,
        Number(context.req.param('attachmentId')),
      );
      return context.body(null, 204);
    });
    repairs.get('/:id', async (context) => {
      const actor = await actorOf(context);
      return json(
        context,
        await service.getRepair(actor, Number(context.req.param('id'))),
      );
    });
    repairs.patch('/:id/assign', async (context) => {
      const actor = await actorOf(context);
      const body = await context.req.json<Record<string, unknown>>();
      return json(
        context,
        await service.assignRepair(
          actor,
          Number(context.req.param('id')),
          body.assigneeId ?? null,
        ),
      );
    });
    repairs.patch('/:id/priority', async (context) => {
      const actor = await actorOf(context);
      const body = await context.req.json<Record<string, unknown>>();
      return json(
        context,
        await service.setRepairPriority(
          actor,
          Number(context.req.param('id')),
          body.priority,
        ),
      );
    });
    repairs.post('/:id/records', async (context) => {
      const actor = await actorOf(context);
      const body = await context.req.json<Record<string, unknown>>();
      await service.addRepairRecord(
        actor,
        Number(context.req.param('id')),
        body.content,
      );
      return json(context, { saved: true }, 201);
    });
    repairs.post('/:id/start', async (context) => {
      const actor = await actorOf(context);
      await service.startRepair(actor, Number(context.req.param('id')));
      return json(context, { started: true });
    });
    repairs.post('/:id/submit-review', async (context) => {
      const actor = await actorOf(context);
      await service.submitRepairReview(actor, Number(context.req.param('id')));
      return json(context, { submitted: true });
    });
    repairs.post('/:id/review', async (context) => {
      const actor = await actorOf(context);
      const body = await context.req.json<Record<string, unknown>>();
      await service.reviewRepair(
        actor,
        Number(context.req.param('id')),
        body.decision,
        body.remark,
      );
      return json(context, { reviewed: true });
    });
    repairs.post('/:id/files', async (context) => {
      const actor = await actorOf(context);
      const stage = context.req.query('stage') ?? 'before';
      const note = context.req.query('note') ?? null;
      const uploaded = await uploadAll(
        await parseUploadedFiles(context.req, { maxFiles: MAX_UPLOAD_FILES }),
      );
      await service.addRepairFiles(
        actor,
        Number(context.req.param('id')),
        stage,
        uploaded,
        note,
      );
      return json(context, { uploaded: uploaded.length }, 201);
    });

    // -------------------------------------------------------------- dashboard

    const dashboard = routes();
    dashboard.get('/me', async (context) => {
      const actor = await actorOf(context);
      return json(context, {
        userId: actor.userId,
        roles: [...actor.roles].sort(),
      });
    });
    dashboard.get('/', async (context) => {
      const actor = await actorOf(context);
      // Every signed-in user has a workbench; roles without business data see zeros.
      return json(context, await service.dashboard(actor));
    });

    // ------------------------------------------------------------------ files

    const appFiles = routes();
    appFiles.get('/:fileId/content', async (context) => {
      return serveFile(context, false);
    });
    appFiles.get('/:fileId/download', async (context) => {
      return serveFile(context, true);
    });

    async function serveFile(
      context: Context<AuthorizationEnv>,
      download: boolean,
    ): Promise<Response> {
      const actor = await actorOf(context);
      const fileId = context.req.param('fileId') ?? '';
      const record = await service.getFileRecord(fileId);
      if (!record) {
        throw new BusinessError('NOT_FOUND', '文件不存在。', 404);
      }
      if (!(await service.canAccessFile(actor, fileId))) {
        throw new BusinessError('FORBIDDEN', '无权访问该文件。', 403);
      }
      const disk = drive.use(text(record.disk));
      const bytes = await disk.getBytes(text(record.key));
      const filename = text(record.filename);
      const disposition = `${download ? 'attachment' : 'inline'}; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
      return new Response(bytes, {
        status: 200,
        headers: {
          'content-type': text(record.mimeType) || 'application/octet-stream',
          'content-length': String(bytes.byteLength),
          'content-disposition': disposition,
          'cache-control': 'private, max-age=0, must-revalidate',
        },
      });
    }

    router.route('/equipment', equipment);
    router.route('/templates', templates);
    router.route('/inspections', inspections);
    router.route('/repairs', repairs);
    router.route('/dashboard', dashboard);
    router.route('/app-files', appFiles);
    // The route contribution is mounted on the application's blank-env router;
    // each sub-router above carries the authorization variables it needs.
    return router as unknown as Hono;
  });

/** Narrow an unknown row value to a display string. */
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

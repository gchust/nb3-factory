import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import type { AuthorizationEnv } from '@nocobase/authorization/core';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { driveManagerToken } from '@nocobase/app-server/drive';
import type { Application } from '@nocobase/app-server/application';
import { Hono, type Context } from 'hono';

import {
  serviceDomainToken,
  ServiceDomainError,
  type ServiceDomainService,
} from '../providers/service-domain.js';
import { authorize } from '../service/access.js';
import { asText } from '../service/text.js';
import {
  ATTACHMENT_CATEGORY,
  SERVICE_SCHEDULE_TARGETS,
  type ServiceRole,
  type ServiceScheduleTarget,
  type TransitionName,
} from '../service/constants.js';

type Env = AuthorizationEnv & AuthEnv;
type Ctx = Context<Env>;

/** Friendly run keys the controlled-execution button posts to. */
const SCHEDULE_RUN_TARGETS: Record<string, ServiceScheduleTarget> = {
  'daily-inspections': SERVICE_SCHEDULE_TARGETS.dailyInspections,
  'overdue-reminders': SERVICE_SCHEDULE_TARGETS.overdueReminders,
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The PNG magic number; a renamed or truncated file is not a real photo. */
function isPngContent(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

/** A DOCX is a ZIP container, so it must start with the local file header. */
function isZipContent(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

function forbidden(message = '你没有执行该操作的权限。'): ServiceDomainError {
  return new ServiceDomainError('FORBIDDEN', message, 403);
}

function requireAccess(
  result: { readonly policies: unknown } | undefined,
): void {
  if (!result) {
    throw forbidden();
  }
}

export const serviceRoutes: readonly AppApiRouteContribution<Application>[] = [
  defineApiRoutes((app) => {
    const router = new Hono<Env>();
    const service: ServiceDomainService =
      app.container.resolve(serviceDomainToken);
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const drive = app.container.resolve(driveManagerToken);
    const disk = drive.use('local');

    router.onError((error, context) => {
      if (error instanceof ServiceDomainError) {
        return context.json(
          { code: error.code, message: error.message },
          error.status as 400,
        );
      }
      throw error;
    });

    // Scoped to the paths this route owns. A `router.use('*', …)` would leak
    // into every contribution mounted after this one and authenticate paths
    // this route never declared.
    router.use('/service/*', auth.required());
    router.use('/service/*', authorization.middleware());

    const actorOf = async (
      context: Ctx,
    ): Promise<{ id: string; role: ServiceRole }> => {
      const session = context.get('auth');
      const user = session?.user;
      if (!user || typeof user.id !== 'string' || user.id.length === 0) {
        throw new ServiceDomainError('UNAUTHENTICATED', '请先登录。', 401);
      }
      const id = String(user.id);
      return { id, role: await service.roleOf(id) };
    };

    const body = async <T extends Record<string, unknown>>(
      context: Ctx,
    ): Promise<T> => {
      try {
        return await context.req.json();
      } catch {
        return {} as T;
      }
    };

    // --------------------------------------------------------- session context

    // The role the server computes for the signed-in identity. Pages read it to
    // decide which maintenance controls to offer; every endpoint still enforces
    // its own authorization, so hiding a control is presentation only.
    router.get('/service/context', async (context) => {
      const session = context.get('auth');
      const user = session?.user;
      const { id, role } = await actorOf(context);
      const named = user as { name?: unknown } | undefined;
      return context.json({
        data: {
          userId: id,
          name: typeof named?.name === 'string' ? named.name : id,
          role,
        },
      });
    });

    // ------------------------------------------------------------- dashboard

    router.get('/service/dashboard', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.dashboard', 'view'));
      return context.json({ data: await service.dashboard(id, role) });
    });

    // ------------------------------------------------------------ work orders

    router.get('/service/work-orders', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(
        await authorize(
          context,
          role.integration ? 'service.deviceReports' : 'service.workOrders',
          role.integration ? 'viewOwn' : 'view',
        ),
      );
      const query = context.req.query();
      const result = await service.listWorkOrders(id, role, {
        status: query.status,
        priority: query.priority,
        keyword: query.keyword,
        assigneeId: query.assigneeId,
        group: query.group,
        overdue: query.overdue === 'true',
        page: query.page,
        pageSize: query.pageSize,
      });
      return context.json({ data: result.rows, meta: { total: result.total } });
    });

    router.post('/service/work-orders', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(
        await authorize(
          context,
          role.integration ? 'service.deviceReports' : 'service.workOrders',
          role.integration ? 'submit' : 'create',
        ),
      );
      const input = await body(context);
      const order = await service.createWorkOrder(id, input, {
        sourceFallback: role.integration ? 'device_platform' : undefined,
      });
      return context.json({ data: order }, 201);
    });

    router.get('/service/work-orders/:id', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(
        await authorize(
          context,
          role.integration ? 'service.deviceReports' : 'service.workOrders',
          role.integration ? 'viewOwn' : 'view',
        ),
      );
      const detail = await service.orderDetail(
        id,
        role,
        context.req.param('id'),
      );
      if (!detail) {
        return context.json(
          { code: 'ORDER_NOT_FOUND', message: '工单不存在。' },
          404,
        );
      }
      return context.json({ data: detail });
    });

    router.post('/service/work-orders/:id/transition', async (context) => {
      const { id, role } = await actorOf(context);
      const input = await body<{
        action?: string;
        resolution?: unknown;
        note?: unknown;
      }>(context);
      const action = String(input.action ?? '') as TransitionName;
      if (
        !['accept', 'start', 'submit', 'confirm', 'return'].includes(action)
      ) {
        throw new ServiceDomainError('INVALID_ACTION', '未知的工单操作。', 400);
      }
      requireAccess(await authorize(context, 'service.workOrders', action));
      const order = await service.applyTransition(
        id,
        role,
        action,
        context.req.param('id'),
        {
          resolution: input.resolution,
          note: input.note,
        },
      );
      return context.json({ data: order });
    });

    router.post('/service/work-orders/:id/comments', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.workOrders', 'comment'));
      const input = await body<{ content?: unknown; note?: unknown }>(context);
      await service.addComment(
        id,
        role,
        context.req.param('id'),
        asText(input.content ?? input.note),
      );
      return context.json({ data: { ok: true } });
    });

    router.post('/service/work-orders/:id/share', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.workOrders', 'share'));
      const input = await body<{
        engineerId?: unknown;
        sharedWithId?: unknown;
      }>(context);
      const share = await service.shareWorkOrder(
        id,
        role,
        context.req.param('id'),
        asText(input.engineerId ?? input.sharedWithId),
      );
      return context.json({ data: share });
    });

    router.delete(
      '/service/work-orders/:id/share/:engineerId',
      async (context) => {
        const { id, role } = await actorOf(context);
        requireAccess(
          await authorize(context, 'service.workOrders', 'unshare'),
        );
        await service.unshareWorkOrder(
          id,
          role,
          context.req.param('id'),
          context.req.param('engineerId'),
        );
        return context.json({ data: { ok: true } });
      },
    );

    // ------------------------------------------------------------- attachments

    router.post('/service/work-orders/:id/attachments', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.workOrders', 'attach'));
      const orderId = context.req.param('id');
      // Refuse a closed order or a read-only share before the file is stored,
      // so a rejected upload does not leave an orphaned file record behind.
      await service.assertWritable(id, role, orderId);
      let form: Record<string, string | File | (string | File)[]>;
      try {
        form = await context.req.parseBody();
      } catch {
        throw new ServiceDomainError(
          'INVALID_UPLOAD',
          '无法解析上传内容。',
          400,
        );
      }
      const rawFile = form['file'];
      const file = Array.isArray(rawFile) ? rawFile[0] : rawFile;
      if (!(file instanceof File)) {
        throw new ServiceDomainError(
          'FILE_REQUIRED',
          '请选择要上传的文件。',
          400,
        );
      }
      const category =
        form['category'] === ATTACHMENT_CATEGORY.report
          ? ATTACHMENT_CATEGORY.report
          : ATTACHMENT_CATEGORY.photo;
      const filename = file.name || 'upload';
      const ext = filename.includes('.')
        ? filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()
        : '';
      const mimeType = file.type || '';
      if (category === ATTACHMENT_CATEGORY.photo) {
        if (mimeType !== 'image/png' && ext !== 'png') {
          throw new ServiceDomainError(
            'INVALID_FILE_TYPE',
            '照片仅支持 PNG 格式。',
            415,
          );
        }
      } else if (
        ext !== 'docx' &&
        !mimeType.includes('wordprocessingml') &&
        mimeType !== 'application/msword'
      ) {
        throw new ServiceDomainError(
          'INVALID_FILE_TYPE',
          '维修报告仅支持 DOCX 格式。',
          415,
        );
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.byteLength > MAX_UPLOAD_BYTES) {
        throw new ServiceDomainError(
          'FILE_TOO_LARGE',
          '文件过大（上限 10MB）。',
          413,
        );
      }
      // The declared extension and MIME type are only a claim; a corrupted or
      // renamed file is refused with a real failure before it is stored.
      if (category === ATTACHMENT_CATEGORY.photo) {
        if (!isPngContent(bytes)) {
          throw new ServiceDomainError(
            'INVALID_FILE_CONTENT',
            'PNG 文件内容无效或已损坏。',
            415,
          );
        }
      } else if (!isZipContent(bytes)) {
        throw new ServiceDomainError(
          'INVALID_FILE_CONTENT',
          'DOCX 文件内容无效或已损坏。',
          415,
        );
      }
      const fileId = service.newFileId();
      const key = `service-attachments/${fileId}${ext ? `.${ext}` : ''}`;
      await disk.put(key, bytes);
      try {
        await service.registerFile({
          id: fileId,
          disk: 'local',
          key,
          filename,
          ext,
          mimeType:
            mimeType ||
            (ext === 'docx'
              ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : 'application/octet-stream'),
          size: bytes.byteLength,
        });
        const attachment = await service.attachFile(
          id,
          role,
          orderId,
          fileId,
          category,
        );
        return context.json({ data: attachment }, 201);
      } catch (error) {
        await disk.delete(key).catch(() => undefined);
        throw error;
      }
    });

    router.get('/service/attachments/:id/content', async (context) => {
      const { id, role } = await actorOf(context);
      const found = await service.getAttachmentFile(
        id,
        role,
        context.req.param('id'),
      );
      if (!found) {
        throw new ServiceDomainError(
          'ATTACHMENT_NOT_FOUND',
          '附件不存在。',
          404,
        );
      }
      const { file } = found;
      const bytes = await disk.getBytes(String(file.key));
      const mimeType = asText(file.mimeType, 'application/octet-stream');
      const filename = asText(file.filename, 'attachment');
      return context.body(bytes as unknown as Uint8Array<ArrayBuffer>, 200, {
        'content-type': mimeType,
        'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'content-length': String(bytes.byteLength),
        'cache-control': 'private, no-store',
      });
    });

    router.delete(
      '/service/work-orders/:id/attachments/:attachmentId',
      async (context) => {
        const { id, role } = await actorOf(context);
        requireAccess(await authorize(context, 'service.workOrders', 'detach'));
        const found = await service.getAttachmentFile(
          id,
          role,
          context.req.param('attachmentId'),
        );
        await service.detachFile(
          id,
          role,
          context.req.param('id'),
          context.req.param('attachmentId'),
        );
        if (found) {
          await disk.delete(String(found.file.key)).catch(() => undefined);
          await service.purgeFile(String(found.file.id));
        }
        return context.json({ data: { ok: true } });
      },
    );

    // ------------------------------------------------------------ master data

    router.get('/service/customers', async (context) => {
      await actorOf(context);
      requireAccess(await authorize(context, 'service.customers', 'view'));
      return context.json({ data: await service.listCustomers() });
    });

    router.post('/service/customers', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.customers', 'manage'));
      const input = await body(context);
      return context.json(
        { data: await service.saveCustomer(id, role, input) },
        201,
      );
    });

    router.put('/service/customers/:id', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.customers', 'manage'));
      const input = await body(context);
      return context.json({
        data: await service.saveCustomer(id, role, {
          ...input,
          id: context.req.param('id'),
        }),
      });
    });

    router.delete('/service/customers/:id', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.customers', 'manage'));
      await service.deleteCustomer(id, role, context.req.param('id'));
      return context.json({ data: { ok: true } });
    });

    router.get('/service/devices', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.devices', 'view'));
      return context.json({ data: await service.listDevices(id, role) });
    });

    router.post('/service/devices', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.devices', 'manage'));
      const input = await body(context);
      return context.json(
        { data: await service.saveDevice(id, role, input) },
        201,
      );
    });

    router.put('/service/devices/:id', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.devices', 'manage'));
      const input = await body(context);
      return context.json({
        data: await service.saveDevice(id, role, {
          ...input,
          id: context.req.param('id'),
        }),
      });
    });

    router.delete('/service/devices/:id', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.devices', 'manage'));
      await service.deleteDevice(id, role, context.req.param('id'));
      return context.json({ data: { ok: true } });
    });

    router.get('/service/team-members', async (context) => {
      const { role } = await actorOf(context);
      if (!role.supervisor) {
        throw forbidden();
      }
      return context.json({ data: await service.listTeamMembers() });
    });

    router.get('/service/engineers', async (context) => {
      await actorOf(context);
      return context.json({ data: await service.listEngineers() });
    });

    router.post('/service/team-members', async (context) => {
      const { id, role } = await actorOf(context);
      const input = await body(context);
      return context.json(
        { data: await service.saveTeamMember(id, role, input) },
        201,
      );
    });

    router.put('/service/team-members/:id', async (context) => {
      const { id, role } = await actorOf(context);
      const input = await body(context);
      return context.json({
        data: await service.saveTeamMember(id, role, {
          ...input,
          id: context.req.param('id'),
        }),
      });
    });

    router.delete('/service/team-members/:id', async (context) => {
      const { id, role } = await actorOf(context);
      await service.deleteTeamMember(id, role, context.req.param('id'));
      return context.json({ data: { ok: true } });
    });

    // -------------------------------------------------------------- knowledge

    router.get('/service/knowledge', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.knowledge', 'view'));
      return context.json({ data: await service.listKnowledge(id, role) });
    });

    router.post('/service/knowledge', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.knowledge', 'manage'));
      const input = await body(context);
      return context.json(
        { data: await service.saveKnowledge(id, role, input) },
        201,
      );
    });

    router.put('/service/knowledge/:id', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.knowledge', 'manage'));
      const input = await body(context);
      return context.json({
        data: await service.saveKnowledge(id, role, {
          ...input,
          id: context.req.param('id'),
        }),
      });
    });

    router.delete('/service/knowledge/:id', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.knowledge', 'manage'));
      await service.deleteKnowledge(id, role, context.req.param('id'));
      return context.json({ data: { ok: true } });
    });

    router.get('/service/manuals', async (context) => {
      await actorOf(context);
      requireAccess(await authorize(context, 'service.manuals', 'view'));
      return context.json({ data: await service.listManuals() });
    });

    router.post('/service/manuals', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.manuals', 'manage'));
      const input = await body(context);
      return context.json(
        { data: await service.saveManual(id, role, input) },
        201,
      );
    });

    router.put('/service/manuals/:id', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.manuals', 'manage'));
      const input = await body(context);
      return context.json({
        data: await service.saveManual(id, role, {
          ...input,
          id: context.req.param('id'),
        }),
      });
    });

    router.delete('/service/manuals/:id', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.manuals', 'manage'));
      await service.deleteManual(id, role, context.req.param('id'));
      return context.json({ data: { ok: true } });
    });

    // ------------------------------------------------------------ inspections

    router.get('/service/inspections', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.inspections', 'view'));
      return context.json({ data: await service.listInspections(id, role) });
    });

    router.post('/service/inspections/:id/complete', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(
        await authorize(context, 'service.inspections', 'complete'),
      );
      const input = await body<{ result?: unknown }>(context);
      const record = await service.completeInspection(
        id,
        role,
        context.req.param('id'),
        asText(input.result),
      );
      return context.json({ data: record });
    });

    router.post('/service/inspections/generate', async (context) => {
      const { role } = await actorOf(context);
      if (!role.supervisor) {
        throw forbidden();
      }
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
      }).format(new Date());
      // The scheduled firing always generates for the Shanghai day it runs in.
      // A controlled run may name an explicit day, and it goes through the same
      // Scheduler target so the run leaves the same execution record.
      const requested = (await body<{ date?: unknown }>(context)).date;
      const date =
        typeof requested === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(requested)
          ? requested
          : undefined;
      const run = await service.runServiceSchedule(
        SERVICE_SCHEDULE_TARGETS.dailyInspections,
        { date },
      );
      return context.json({ data: { ...run, date: date ?? today } });
    });

    // A controlled immediate execution of an application schedule. The server
    // resolves the materialized schedule and lets the Scheduler dispatch it, so
    // the run reaches the registered target and records an occurrence the same
    // way a cron tick does. A stopped plan is refused, so it cannot produce new
    // results while disabled.
    router.post('/service/schedules/:key/run', async (context) => {
      const { role } = await actorOf(context);
      if (!role.supervisor) {
        throw forbidden();
      }
      const target = SCHEDULE_RUN_TARGETS[context.req.param('key')];
      if (!target) {
        throw new ServiceDomainError('SCHEDULE_NOT_FOUND', '未知的计划。', 404);
      }
      const requested = (await body<{ date?: unknown }>(context)).date;
      const date =
        typeof requested === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(requested)
          ? requested
          : undefined;
      const run = await service.runServiceSchedule(target, { date });
      return context.json({ data: run });
    });

    // -------------------------------------------------------------- assistant

    router.get('/service/assistant/conversations', async (context) => {
      const { id } = await actorOf(context);
      return context.json({ data: await service.listConversations(id) });
    });

    router.post('/service/assistant/conversations', async (context) => {
      const { id } = await actorOf(context);
      const input = await body<{
        conversationId?: unknown;
        title?: unknown;
        messages?: unknown;
      }>(context);
      const record = await service.saveConversation(
        id,
        input.conversationId === undefined || input.conversationId === null
          ? undefined
          : asText(input.conversationId),
        asText(input.title, '服务助手会话'),
        input.messages,
      );
      return context.json({ data: record });
    });

    router.post('/service/assistant/query', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(await authorize(context, 'service.assistant', 'query'));
      const input = await body<{ question?: unknown; workOrderId?: unknown }>(
        context,
      );
      const answer = await service.askAssistant(
        id,
        role,
        asText(input.question),
        input.workOrderId === undefined || input.workOrderId === null
          ? undefined
          : asText(input.workOrderId),
      );
      return context.json({ data: answer });
    });

    router.post('/service/assistant/confirm', async (context) => {
      const { id } = await actorOf(context);
      requireAccess(await authorize(context, 'service.assistant', 'confirm'));
      const input = await body(context);
      const order = await service.createWorkOrder(id, input, {
        sourceFallback: 'assistant',
      });
      return context.json({ data: order }, 201);
    });

    // -------------------------------------------------------- device platform

    router.post('/service/device-platform/reports', async (context) => {
      const { id } = await actorOf(context);
      requireAccess(
        await authorize(context, 'service.deviceReports', 'submit'),
      );
      const input = await body(context);
      const order = await service.createWorkOrder(id, input, {
        sourceFallback: 'device_platform',
      });
      return context.json(
        { data: { id: order.id, orderNo: order.orderNo } },
        201,
      );
    });

    router.get('/service/device-platform/reports', async (context) => {
      const { id, role } = await actorOf(context);
      requireAccess(
        await authorize(context, 'service.deviceReports', 'viewOwn'),
      );
      const query = context.req.query();
      const result = await service.listWorkOrders(id, role, {
        page: query.page,
        pageSize: query.pageSize,
      });
      return context.json({ data: result.rows, meta: { total: result.total } });
    });

    return router as unknown as Hono;
  }),
];

export default serviceRoutes;

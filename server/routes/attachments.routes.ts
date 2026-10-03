import { Hono, type Context } from 'hono';
import { Readable } from 'node:stream';

import {
  ServiceAttachmentError,
  type ServiceAttachment,
} from '../service/attachment-service.js';
import {
  hasCapability,
  resolvePolicy,
  scopedRepository,
} from '../service/authorization-helper.js';
import {
  currentUserId,
  jsonError,
  type ServiceEnv,
  type ServiceRouteDeps,
} from './support.js';

const EXTENSION_MIME: Record<string, string> = {
  png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

type Ctx = Context<ServiceEnv>;

/**
 * Repair attachments: an on-site PNG photo and a DOCX repair report.
 *
 * Bytes are served by this route rather than the file plugin's public byte
 * route, so an unauthenticated or unauthorized caller cannot read a file even
 * with its address: every byte request re-checks the owning order's `view`
 * permission. Upload and removal additionally require the `attach` action.
 */
export function createAttachmentRouter(
  deps: ServiceRouteDeps,
): Hono<ServiceEnv> {
  const router = new Hono<ServiceEnv>();

  router.get('/orders/:id/attachments', async (context) => {
    const orderId = Number(context.req.param('id'));
    if (!(await orderVisible(context, orderId))) {
      return jsonError(
        context,
        404,
        'ORDER_NOT_FOUND',
        '工单不存在或无权查看。',
      );
    }
    return context.json({
      data: (await deps.attachments.list(orderId)).map(toView),
    });
  });

  router.post('/orders/:id/attachments', async (context) => {
    const orderId = Number(context.req.param('id'));
    if (!(await orderAttachable(context, orderId))) {
      return jsonError(
        context,
        404,
        'ORDER_NOT_FOUND',
        '工单不存在或无权上传附件。',
      );
    }
    let form: Record<string, unknown> | undefined;
    try {
      form = await context.req.parseBody();
    } catch {
      form = undefined;
    }
    const file = form?.file;
    if (!(file instanceof File)) {
      return jsonError(context, 400, 'EMPTY', '请选择要上传的文件。');
    }
    const kindHint = typeof form?.kind === 'string' ? form.kind : undefined;
    try {
      const uploaded = await deps.attachments.upload(
        orderId,
        currentUserId(context),
        file,
        kindHint,
      );
      return context.json({ data: toView(uploaded.attachment) }, 201);
    } catch (error) {
      return attachmentError(context, error);
    }
  });

  router.delete('/orders/:id/attachments/:attachmentId', async (context) => {
    const orderId = Number(context.req.param('id'));
    if (!(await orderAttachable(context, orderId))) {
      return jsonError(
        context,
        404,
        'ORDER_NOT_FOUND',
        '工单不存在或无权移除附件。',
      );
    }
    const removed = await deps.attachments.remove(
      orderId,
      context.req.param('attachmentId'),
    );
    if (!removed) {
      return jsonError(context, 404, 'NOT_FOUND', '附件不存在。');
    }
    return context.json({ data: { removed: true } });
  });

  router.get(
    '/orders/:id/attachments/:attachmentId/content',
    async (context) => {
      return serveBytes(context, 'inline');
    },
  );

  router.get(
    '/orders/:id/attachments/:attachmentId/download',
    async (context) => {
      return serveBytes(context, 'attachment');
    },
  );

  async function serveBytes(
    context: Ctx,
    disposition: 'inline' | 'attachment',
  ) {
    const orderId = Number(context.req.param('id'));
    if (!(await orderVisible(context, orderId))) {
      return jsonError(
        context,
        404,
        'ORDER_NOT_FOUND',
        '工单不存在或无权查看。',
      );
    }
    try {
      const { attachment, stream } = await deps.attachments.openRead(
        orderId,
        context.req.param('attachmentId') ?? '',
      );
      const headers = new Headers();
      headers.set(
        'Content-Type',
        EXTENSION_MIME[attachment.ext] ?? 'application/octet-stream',
      );
      headers.set('Content-Length', String(attachment.size));
      headers.set(
        'Content-Disposition',
        `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      );
      headers.set('Cache-Control', 'private, no-store');
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 200,
        headers,
      });
    } catch (error) {
      return attachmentError(context, error);
    }
  }

  async function orderVisible(context: Ctx, orderId: number): Promise<boolean> {
    return orderAccessible(context, orderId, 'view');
  }

  async function orderAccessible(
    context: Ctx,
    orderId: number,
    action: string,
  ): Promise<boolean> {
    const resolved = await resolvePolicy(
      context.get('authz'),
      'service.orders',
      action,
      'serviceOrders',
    );
    if (resolved.effect === 'deny') {
      return false;
    }
    const row = await scopedRepository(
      deps.database,
      'serviceOrders',
      resolved,
    ).findOne({
      filter: { id: orderId },
    });
    return Boolean(row);
  }

  /**
   * Uploading and removing an attachment need the `attach` capability and a
   * readable order. The `attach` grants name the attachment file collections,
   * so they carry no `serviceOrders` row policy and the order scope comes from
   * the caller's `view` policy instead. Requiring `attach` here keeps a reader
   * without the capability out.
   */
  async function orderAttachable(
    context: Ctx,
    orderId: number,
  ): Promise<boolean> {
    if (!(await hasCapability(context.get('authz'), 'service.orders', 'attach'))) {
      return false;
    }
    return orderVisible(context, orderId);
  }

  return router;
}

function toView(attachment: ServiceAttachment) {
  return {
    id: attachment.id,
    orderId: attachment.orderId,
    filename: attachment.filename,
    ext: attachment.ext,
    mimeType: attachment.mimeType,
    size: attachment.size,
    kind: attachment.kind,
    createdAt: attachment.createdAt,
    previewable: attachment.previewable,
    contentUrl: `/api/service/orders/${attachment.orderId}/attachments/${attachment.id}/content`,
    downloadUrl: `/api/service/orders/${attachment.orderId}/attachments/${attachment.id}/download`,
  };
}

function attachmentError(context: Ctx, error: unknown) {
  if (error instanceof ServiceAttachmentError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'TOO_LARGE' ? 413 : 422;
    return jsonError(context, status, error.code, error.message);
  }
  throw error;
}

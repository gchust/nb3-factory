import { Hono } from 'hono';

import { resolvePolicy } from '../service/authorization-helper.js';
import { asIso, asText } from '../service/values.js';
import {
  currentUserId,
  jsonError,
  parseJsonBody,
  type ServiceEnv,
  type ServiceRouteDeps,
} from './support.js';

/**
 * The device-report endpoint an external service calls.
 *
 * The caller authenticates with an API key, which the authentication plugin
 * resolves into its owner's session, so the exact same session and
 * authorization rules apply as for a signed-in engineer. `eventNo` is the
 * caller's stable event identifier: submitting it twice returns the order the
 * first call created instead of registering a second one.
 */
export function createDeviceReportRouter(
  deps: ServiceRouteDeps,
): Hono<ServiceEnv> {
  const router = new Hono<ServiceEnv>();

  router.post('/device-reports', async (context) => {
    const resolved = await resolvePolicy(
      context.get('authz'),
      'service.deviceReports',
      'submit',
      'serviceOrders',
    );
    if (resolved.effect === 'deny') {
      return jsonError(context, 403, 'FORBIDDEN', '无权上报设备事件。');
    }
    const body = await parseJsonBody(context);
    const eventNo = text(body.eventNo ?? body.externalEventNo);
    const deviceNo = text(body.deviceNo);
    const title = text(body.title);
    if (!eventNo) {
      return jsonError(
        context,
        422,
        'INVALID_INPUT',
        'eventNo 为必填项，用于去重。',
      );
    }
    if (!deviceNo) {
      return jsonError(context, 422, 'INVALID_INPUT', 'deviceNo 为必填项。');
    }
    if (!title) {
      return jsonError(context, 422, 'INVALID_INPUT', 'title 为必填项。');
    }

    const device = await deps.database
      .query()
      .selectFrom('devices')
      .select(['id', 'customerId', 'status', 'engineerProfileId'])
      .where('deviceNo', '=', deviceNo)
      .executeTakeFirst();
    if (!device) {
      return jsonError(
        context,
        404,
        'DEVICE_NOT_FOUND',
        `设备 ${deviceNo} 不存在。`,
      );
    }
    if (String(device.status) === 'disabled') {
      return jsonError(
        context,
        422,
        'DEVICE_DISABLED',
        '停用设备不能上报新事件。',
      );
    }

    const existing = await deps.database
      .query()
      .selectFrom('serviceOrders')
      .select(['id', 'orderNo', 'status'])
      .where('externalEventNo', '=', eventNo)
      .executeTakeFirst();
    if (existing) {
      return context.json({
        data: {
          orderId: Number(existing.id),
          orderNo: String(existing.orderNo),
          status: String(existing.status),
          duplicate: true,
        },
      });
    }

    const deadline = parseDate(body.deadline);
    try {
      const order = await deps.orders.createOrder(
        {
          title,
          customerId: Number(device.customerId),
          deviceId: Number(device.id),
          problemDescription:
            text(body.description ?? body.problemDescription) ?? null,
          priority: body.priority === 'urgent' ? 'urgent' : 'normal',
          deadline,
          confidential: body.confidential === true,
          externalEventNo: eventNo,
          reporterId: currentUserId(context),
        },
        { userId: currentUserId(context) },
      );
      return context.json(
        {
          data: {
            orderId: Number(order.id),
            orderNo: order.orderNo,
            duplicate: false,
          },
        },
        201,
      );
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        const code = String((error as { code: unknown }).code);
        const status = code === 'DEVICE_DISABLED' ? 422 : 400;
        return jsonError(context, status, code, error.message);
      }
      throw error;
    }
  });

  router.get('/device-reports', async (context) => {
    const resolved = await resolvePolicy(
      context.get('authz'),
      'service.deviceReports',
      'submit',
      'serviceOrders',
    );
    if (resolved.effect === 'deny') {
      return jsonError(context, 403, 'FORBIDDEN', '无权读取设备事件。');
    }
    const rows = await deps.database
      .query()
      .selectFrom('serviceOrders')
      .select([
        'id',
        'orderNo',
        'status',
        'title',
        'priority',
        'externalEventNo',
        'assigneeId',
        'createdAt',
        'updatedAt',
      ])
      .where('reporterId', '=', currentUserId(context))
      .where('source', '=', 'external')
      .orderBy('id', 'desc')
      .limit(100)
      .execute();
    return context.json({
      data: rows.map((row) => ({
        orderId: Number(row.id),
        orderNo: String(row.orderNo),
        eventNo:
          row.externalEventNo == null ? null : asText(row.externalEventNo),
        status: String(row.status),
        title: String(row.title),
        priority: String(row.priority),
        assigned: row.assigneeId != null,
        updatedAt: toIso(row.updatedAt),
      })),
    });
  });

  router.get('/device-reports/:eventNo', async (context) => {
    const resolved = await resolvePolicy(
      context.get('authz'),
      'service.deviceReports',
      'submit',
      'serviceOrders',
    );
    if (resolved.effect === 'deny') {
      return jsonError(context, 403, 'FORBIDDEN', '无权读取设备事件。');
    }
    const eventNo = context.req.param('eventNo');
    const row = await deps.database
      .query()
      .selectFrom('serviceOrders')
      .select([
        'id',
        'orderNo',
        'status',
        'title',
        'priority',
        'externalEventNo',
        'assigneeId',
        'createdAt',
        'updatedAt',
      ])
      .where('externalEventNo', '=', eventNo)
      .where('reporterId', '=', currentUserId(context))
      .executeTakeFirst();
    if (!row) {
      return jsonError(
        context,
        404,
        'EVENT_NOT_FOUND',
        `事件 ${eventNo} 不存在。`,
      );
    }
    return context.json({
      data: {
        orderId: Number(row.id),
        orderNo: String(row.orderNo),
        eventNo:
          row.externalEventNo == null ? null : asText(row.externalEventNo),
        status: String(row.status),
        title: String(row.title),
        priority: String(row.priority),
        assigned: row.assigneeId != null,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
      },
    });
  });

  return router;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

function toIso(value: unknown): string | null {
  return asIso(value);
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

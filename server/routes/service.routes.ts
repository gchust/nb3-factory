import { Hono, type Context } from 'hono';
import type { FilterNode } from '@nocobase/db';

import {
  ServiceOrderError,
  type ServiceOrderActor,
} from '../service/order-service.js';
import { ServiceShareError } from '../service/share-service.js';
import { ServiceKnowledgeError } from '../service/knowledge-service.js';
import { asIso, asText } from '../service/values.js';
import {
  resolvePolicy,
  scopedRepository,
  type ResolvedPolicy,
} from '../service/authorization-helper.js';
import {
  currentUserId,
  jsonError,
  parseJsonBody,
  toNumber,
  toText,
  type ServiceEnv,
  type ServiceRouteDeps,
} from './support.js';

type Ctx = Context<ServiceEnv>;

/**
 * The authenticated business API. Every handler first resolves the composite
 * action it needs, then reads or writes through a repository bound to the
 * resulting row policy, so a permitted action can still only reach the rows
 * its own scope allows.
 */
export function createServiceRouter(deps: ServiceRouteDeps): Hono<ServiceEnv> {
  const router = new Hono<ServiceEnv>();

  /** Resolves the composite action; `orderId` also requires the row to be in scope. */
  async function allow(
    context: Ctx,
    resource: string,
    action: string,
    collection: string,
    orderId?: number,
  ): Promise<ResolvedPolicy | false> {
    const resolved = await resolvePolicy(
      context.get('authz'),
      resource,
      action,
      collection,
    );
    if (resolved.effect === 'deny') {
      return false;
    }
    if (orderId === undefined) {
      return resolved;
    }
    const row = await scopedRepository(
      deps.database,
      'serviceOrders',
      resolved,
    ).findOne({
      filter: { id: orderId },
    });
    return row ? resolved : false;
  }

  async function actor(context: Ctx): Promise<ServiceOrderActor> {
    const userId = currentUserId(context);
    const row = await deps.database
      .query()
      .selectFrom('engineerProfiles')
      .select(['id', 'appRole'])
      .where('userId', '=', userId)
      .executeTakeFirst();
    return {
      userId,
      profileId: row ? Number(row.id) : null,
      role: row?.appRole == null ? undefined : asText(row.appRole),
    };
  }

  // ---------------------------------------------------------------- orders

  router.get('/orders', async (context) => {
    const orders = await deps.queries.list(context.get('authz'), {
      search: context.req.query('search') ?? undefined,
      status: context.req.query('status') ?? undefined,
      priority: context.req.query('priority') ?? undefined,
      assigneeId: context.req.query('assigneeId') ?? undefined,
      page: toNumber(context.req.query('page')),
      pageSize: toNumber(context.req.query('pageSize')),
    });
    return context.json({ data: orders });
  });

  router.post('/orders', async (context) => {
    if (!(await allow(context, 'service.orders', 'create', 'serviceOrders'))) {
      return jsonError(context, 403, 'FORBIDDEN', '无权登记工单。');
    }
    const body = await parseJsonBody(context);
    const currentActor = await actor(context);
    try {
      const order = await deps.orders.createOrder(
        {
          title: asText(body.title),
          customerId: Number(body.customerId),
          deviceId: Number(body.deviceId),
          problemDescription:
            body.problemDescription == null
              ? null
              : asText(body.problemDescription),
          priority: body.priority === 'urgent' ? 'urgent' : 'normal',
          deadline: parseDate(body.deadline),
          confidential: body.confidential === true,
          assigneeProfileId: toNumber(body.assigneeProfileId),
          externalEventNo:
            body.externalEventNo == null ? null : asText(body.externalEventNo),
          reporterId: currentActor.userId,
        },
        currentActor,
      );
      const view = await deps.queries.detail(
        context.get('authz'),
        Number(order.id),
      );
      return context.json({ data: view }, 201);
    } catch (error) {
      return orderError(context, error);
    }
  });

  router.get('/orders/:id', async (context) => {
    const view = await deps.queries.detail(
      context.get('authz'),
      Number(context.req.param('id')),
    );
    if (!view) {
      return jsonError(
        context,
        404,
        'ORDER_NOT_FOUND',
        '工单不存在或无权查看。',
      );
    }
    return context.json({ data: view });
  });

  // ------------------------------------------------------------------ me

  router.get('/me', async (context) => {
    const currentActor = await actor(context);
    const profile =
      currentActor.profileId == null
        ? null
        : await deps.database
            .query()
            .selectFrom('engineerProfiles')
            .select(['id', 'displayName', 'username', 'appRole'])
            .where('id', '=', currentActor.profileId)
            .executeTakeFirst();
    const can = async (action: string) =>
      (
        await resolvePolicy(
          context.get('authz'),
          'service.orders',
          action,
          'serviceOrders',
        )
      ).effect !== 'deny';
    return context.json({
      data: {
        userId: currentActor.userId,
        profileId: currentActor.profileId,
        role: currentActor.role ?? null,
        displayName: profile
          ? (profile.displayName ?? profile.username ?? null)
          : null,
        can: {
          createOrder: await can('create'),
          processOrder: await can('process'),
          superviseOrder: await can('supervise'),
          manageKnowledge:
            (
              await resolvePolicy(
                context.get('authz'),
                'service.knowledge',
                'manage',
                'knowledgeArticles',
              )
            ).effect !== 'deny',
          manageLedger:
            (
              await resolvePolicy(
                context.get('authz'),
                'service.ledger',
                'manage',
                'customers',
              )
            ).effect !== 'deny',
          manageInspections:
            (
              await resolvePolicy(
                context.get('authz'),
                'service.inspections',
                'manage',
                'inspections',
              )
            ).effect !== 'deny',
        },
      },
    });
  });

  router.get('/orders/:id/events', async (context) => {
    const orderId = Number(context.req.param('id'));
    if (
      !(await allow(
        context,
        'service.orders',
        'view',
        'serviceOrders',
        orderId,
      ))
    ) {
      return jsonError(
        context,
        404,
        'ORDER_NOT_FOUND',
        '工单不存在或无权查看。',
      );
    }
    const events = await deps.database
      .query()
      .selectFrom('serviceOrderEvents')
      .select([
        'id',
        'action',
        'fromStatus',
        'toStatus',
        'comment',
        'operatorId',
        'operatorRole',
        'idempotencyKey',
        'createdAt',
      ])
      .where('orderId', '=', orderId)
      .orderBy('id', 'asc')
      .execute();
    return context.json({
      data: events.map((row) => ({
        id: Number(row.id),
        action: asText(row.action),
        fromStatus: row.fromStatus == null ? null : asText(row.fromStatus),
        toStatus: row.toStatus == null ? null : asText(row.toStatus),
        comment: row.comment == null ? null : asText(row.comment),
        operatorId: row.operatorId == null ? null : asText(row.operatorId),
        operatorRole:
          row.operatorRole == null ? null : asText(row.operatorRole),
        idempotencyKey:
          row.idempotencyKey == null ? null : asText(row.idempotencyKey),
        createdAt: toIso(row.createdAt),
      })),
    });
  });

  const transitions = [
    { path: 'accept', action: 'supervise', call: 'accept' },
    { path: 'retry-accept', action: 'supervise', call: 'retryAcceptance' },
    { path: 'close', action: 'supervise', call: 'close' },
    { path: 'return', action: 'supervise', call: 'returnToProcessing' },
    { path: 'start', action: 'process', call: 'startProcessing' },
    { path: 'submit', action: 'process', call: 'submitForConfirmation' },
  ] as const;

  for (const transition of transitions) {
    router.post(`/orders/:id/${transition.path}`, async (context) => {
      const orderId = Number(context.req.param('id'));
      if (
        !(await allow(
          context,
          'service.orders',
          transition.action,
          'serviceOrders',
          orderId,
        ))
      ) {
        return jsonError(
          context,
          404,
          'ORDER_NOT_FOUND',
          '工单不存在或无权操作。',
        );
      }
      const body = await parseJsonBody(context);
      const operator = await actor(context);
      const comment =
        body.comment ?? body.note ?? body.reason ?? body.resolution;
      try {
        const service = deps.orders as unknown as Record<
          string,
          (
            id: number,
            who: ServiceOrderActor,
            text?: string,
          ) => Promise<unknown>
        >;
        const result = await service[transition.call](
          orderId,
          operator,
          toText(comment),
        );
        const view = await deps.queries.detail(context.get('authz'), orderId);
        return context.json({ data: { ...(result as object), order: view } });
      } catch (error) {
        return orderError(context, error);
      }
    });
  }

  // ---------------------------------------------------------------- shares

  router.get('/orders/:id/shares', async (context) => {
    const orderId = Number(context.req.param('id'));
    if (
      !(await allow(
        context,
        'service.orders',
        'supervise',
        'serviceOrders',
        orderId,
      ))
    ) {
      return jsonError(
        context,
        404,
        'ORDER_NOT_FOUND',
        '工单不存在或无权查看协作。',
      );
    }
    return context.json({ data: await deps.shares.list(orderId) });
  });

  router.post('/orders/:id/shares', async (context) => {
    const orderId = Number(context.req.param('id'));
    if (
      !(await allow(
        context,
        'service.orders',
        'supervise',
        'serviceOrders',
        orderId,
      ))
    ) {
      return jsonError(
        context,
        404,
        'ORDER_NOT_FOUND',
        '工单不存在或无权分享。',
      );
    }
    const body = await parseJsonBody(context);
    try {
      const share = await deps.shares.share(
        orderId,
        currentUserId(context),
        asText(body.engineerId ?? body.userId),
      );
      return context.json({ data: share }, 201);
    } catch (error) {
      return shareError(context, error);
    }
  });

  router.delete('/orders/:id/shares/:shareId', async (context) => {
    const orderId = Number(context.req.param('id'));
    if (
      !(await allow(
        context,
        'service.orders',
        'supervise',
        'serviceOrders',
        orderId,
      ))
    ) {
      return jsonError(
        context,
        404,
        'ORDER_NOT_FOUND',
        '工单不存在或无权撤销协作。',
      );
    }
    const removed = await deps.shares.revoke(
      orderId,
      Number(context.req.param('shareId')),
    );
    if (!removed) {
      return jsonError(context, 404, 'NOT_FOUND', '协作记录不存在。');
    }
    return context.json({ data: { revoked: true } });
  });

  // -------------------------------------------------------------- engineers

  router.get('/engineers', async (context) => {
    const resolved = await resolvePolicy(
      context.get('authz'),
      'service.orders',
      'supervise',
      'serviceOrders',
    );
    if (resolved.effect === 'deny') {
      return jsonError(context, 403, 'FORBIDDEN', '无权查看工程师列表。');
    }
    const rows = await deps.database
      .query()
      .selectFrom('engineerProfiles')
      .select(['id', 'displayName', 'username', 'appRole', 'groupId', 'userId'])
      .orderBy('id', 'asc')
      .execute();
    return context.json({
      data: rows.map((row) => ({
        id: Number(row.id),
        displayName: row.displayName == null ? null : asText(row.displayName),
        username: String(row.username),
        role: asText(row.appRole),
        groupId: row.groupId == null ? null : Number(row.groupId),
        userId: row.userId == null ? null : asText(row.userId),
      })),
    });
  });

  // ------------------------------------------------------------- dashboard

  router.get('/dashboard', async (context) => {
    return context.json({
      data: await deps.dashboard.summary(
        context.get('authz'),
        currentUserId(context),
      ),
    });
  });

  // ------------------------------------------------------------ inspections

  router.get('/inspections', async (context) => {
    const resolved = await allow(
      context,
      'service.inspections',
      'view',
      'inspections',
    );
    if (!resolved) {
      return context.json({ data: [] });
    }
    const status = context.req.query('status');
    const rows = await scopedRepository(
      deps.database,
      'inspections',
      resolved,
    ).findMany({
      ...(status ? { filter: { status } } : {}),
      sort: {
        kind: 'sort',
        version: 1,
        items: [{ kind: 'field', path: ['planDate'], direction: 'desc' }],
      },
      limit: 200,
    });
    const inspectionRows = rows as unknown as InspectionLite[];
    const devices = await deps.database
      .query()
      .selectFrom('devices')
      .select(['id', 'deviceNo', 'name', 'customerId', 'location'])
      .where(
        'id',
        'in',
        inspectionRows.map((row) => Number(row.deviceId)),
      )
      .execute();
    const deviceById = new Map(devices.map((item) => [Number(item.id), item]));
    return context.json({
      data: inspectionRows.map((row) => ({
        id: Number(row.id),
        deviceId: Number(row.deviceId),
        planDate: String(row.planDate),
        status: String(row.status),
        result: row.result == null ? null : String(row.result),
        completedAt: toIso(row.completedAt),
        device: deviceById.get(Number(row.deviceId)) ?? null,
      })),
    });
  });

  router.post('/inspections/:id/complete', async (context) => {
    const inspectionId = Number(context.req.param('id'));
    const resolved = await allow(
      context,
      'service.inspections',
      'complete',
      'inspections',
    );
    if (!resolved) {
      return jsonError(context, 403, 'FORBIDDEN', '无权完成巡检。');
    }
    const visible = await scopedRepository(
      deps.database,
      'inspections',
      resolved,
    ).findOne({
      filter: { id: inspectionId },
    });
    if (!visible) {
      return jsonError(context, 404, 'NOT_FOUND', '巡检记录不存在或无权完成。');
    }
    const body = await parseJsonBody(context);
    const done = await deps.inspections.complete(
      inspectionId,
      currentUserId(context),
      asText(body.result),
    );
    if (!done) {
      return jsonError(context, 422, 'INVALID_INPUT', '请填写巡检结果。');
    }
    return context.json({ data: { completed: true } });
  });

  router.post('/inspections/generate', async (context) => {
    if (
      !(await allow(context, 'service.inspections', 'manage', 'inspections'))
    ) {
      return jsonError(context, 403, 'FORBIDDEN', '无权生成巡检计划。');
    }
    // The scheduled plan and reminder routines are separate schedules, but a
    // controlled run applies both so a supervisor can exercise the whole sweep
    // from one request. Both calls are the exact methods the scheduler targets
    // invoke, and both are idempotent per day.
    const plans = await deps.inspections.generateDailyPlans();
    const reminders = await deps.inspections.sendOverdueReminders();
    return context.json({
      data: {
        created: plans.created,
        skipped: plans.skipped,
        reminders: reminders.reminders,
      },
    });
  });

  router.post('/reminders/generate', async (context) => {
    if (
      !(await allow(context, 'service.inspections', 'manage', 'inspections'))
    ) {
      return jsonError(context, 403, 'FORBIDDEN', '无权生成超期提醒。');
    }
    return context.json({ data: await deps.inspections.sendOverdueReminders() });
  });

  // -------------------------------------------------------------- knowledge

  router.get('/knowledge', async (context) => {
    const articles = await deps.knowledge.list(
      context.get('authz'),
      context.req.query('search') ?? undefined,
    );
    return context.json({ data: articles });
  });

  router.get('/knowledge/:id', async (context) => {
    const article = await deps.knowledge.detail(
      context.get('authz'),
      Number(context.req.param('id')),
    );
    if (!article) {
      return jsonError(context, 404, 'NOT_FOUND', '知识内容不存在或无权查看。');
    }
    return context.json({ data: article });
  });

  router.post('/knowledge', async (context) => {
    const body = await parseJsonBody(context);
    try {
      const id = await deps.knowledge.create(
        context.get('authz'),
        currentUserId(context),
        body,
      );
      return context.json({ data: { id } }, 201);
    } catch (error) {
      return knowledgeError(context, error);
    }
  });

  router.put('/knowledge/:id', async (context) => {
    const body = await parseJsonBody(context);
    try {
      await deps.knowledge.update(
        context.get('authz'),
        Number(context.req.param('id')),
        body,
      );
      return context.json({ data: { updated: true } });
    } catch (error) {
      return knowledgeError(context, error);
    }
  });

  // ----------------------------------------------------------- ledger CRUD

  for (const collection of ['customers', 'devices'] as const) {
    router.get(`/${collection}`, async (context) => {
      const resolved = await allow(
        context,
        'service.ledger',
        'view',
        collection,
      );
      if (!resolved) {
        return context.json({ data: [] });
      }
      const search = context.req.query('search');
      const searchItems: FilterNode[] = search
        ? [
            {
              kind: 'condition',
              path: ['name'],
              operator: '$includes',
              value: search,
              mode: 'insensitive',
            },
            ...(collection === 'devices'
              ? [
                  {
                    kind: 'condition' as const,
                    path: ['deviceNo'],
                    operator: '$includes' as const,
                    value: search,
                  },
                ]
              : []),
          ]
        : [];
      const rows = await scopedRepository(
        deps.database,
        collection,
        resolved,
      ).findMany({
        ...(searchItems.length > 0
          ? {
              filter: {
                kind: 'filter' as const,
                version: 1 as const,
                root: {
                  kind: 'group' as const,
                  logic: 'or' as const,
                  items: searchItems,
                },
              },
            }
          : {}),
        sort: {
          kind: 'sort',
          version: 1,
          items: [{ kind: 'field', path: ['id'], direction: 'asc' }],
        },
        limit: 500,
      });
      return context.json({ data: rows });
    });

    router.post(`/${collection}`, async (context) => {
      const resolved = await allow(
        context,
        'service.ledger',
        'manage',
        collection,
      );
      if (!resolved) {
        return jsonError(context, 403, 'FORBIDDEN', '无权维护台账。');
      }
      const body = await parseJsonBody(context);
      const values = ledgerValues(collection, body);
      if (typeof values.name === 'string' && values.name.trim() === '') {
        return jsonError(context, 422, 'INVALID_INPUT', '名称为必填项。');
      }
      if (typeof values.name !== 'string') {
        return jsonError(context, 422, 'INVALID_INPUT', '名称为必填项。');
      }
      if (collection === 'devices' && !values.deviceNo) {
        return jsonError(context, 422, 'INVALID_INPUT', '设备编号为必填项。');
      }
      if (collection === 'devices' && !values.customerId) {
        return jsonError(context, 422, 'INVALID_INPUT', '所属客户为必填项。');
      }
      if (
        collection === 'devices' &&
        typeof values.deviceNo === 'string' &&
        (await deviceNoTaken(deps, values.deviceNo))
      ) {
        return jsonError(
          context,
          422,
          'DEVICE_NO_TAKEN',
          '设备编号已存在，请使用其他编号。',
        );
      }
      const now = new Date();
      const created = await scopedRepository(
        deps.database,
        collection,
        resolved,
      ).createOne({
        values: { ...values, createdAt: now, updatedAt: now } as never,
      });
      return context.json({ data: created.record }, 201);
    });

    router.put(`/${collection}/:id`, async (context) => {
      const resolved = await allow(
        context,
        'service.ledger',
        'manage',
        collection,
      );
      if (!resolved) {
        return jsonError(context, 403, 'FORBIDDEN', '无权维护台账。');
      }
      const repository = scopedRepository(deps.database, collection, resolved);
      const id = Number(context.req.param('id'));
      const existing = await repository.findOne({ filter: { id } });
      if (!existing) {
        return jsonError(context, 404, 'NOT_FOUND', '记录不存在或无权修改。');
      }
      const body = await parseJsonBody(context);
      const values = ledgerValues(collection, body, true);
      if (typeof values.name === 'string' && values.name.trim() === '') {
        return jsonError(context, 422, 'INVALID_INPUT', '名称为必填项。');
      }
      if (
        collection === 'devices' &&
        typeof values.deviceNo === 'string' &&
        (await deviceNoTaken(deps, values.deviceNo, id))
      ) {
        return jsonError(
          context,
          422,
          'DEVICE_NO_TAKEN',
          '设备编号已存在，请使用其他编号。',
        );
      }
      await repository.updateOne({
        filter: { id },
        values: { ...values, updatedAt: new Date() } as never,
      });
      return context.json({ data: { updated: true } });
    });
  }

  return router;
}

// -------------------------------------------------------------------- helpers

/**
 * A duplicate `devices.device_no` must be reported as a field validation error,
 * not as the raw database `UNIQUE constraint failed` message. The lookup runs
 * on the default connection so a soft-deleted row still counts as taken.
 */
async function deviceNoTaken(
  deps: ServiceRouteDeps,
  deviceNo: string,
  exceptId?: number,
): Promise<boolean> {
  let query = deps.database
    .query()
    .selectFrom('devices')
    .select('id')
    .where('deviceNo', '=', deviceNo);
  if (exceptId !== undefined) {
    query = query.where('id', '<>', exceptId);
  }
  const rows = (await query.execute()) as unknown as { id: number }[];
  return rows.length > 0;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return asIso(value);
}

interface InspectionLite {
  id: number | string;
  deviceId: number | string;
  planDate: string;
  status: string;
  result: string | null;
  completedAt: Date | string | null;
}

function ledgerValues(
  collection: 'customers' | 'devices',
  body: Record<string, unknown>,
  partial = false,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  const text = (field: string, required = false) => {
    if (body[field] !== undefined || !partial) {
      const value = body[field];
      if (typeof value === 'string' && value.trim() !== '') {
        values[field] = value.trim();
      } else {
        values[field] = required ? '' : null;
      }
    }
  };
  if (collection === 'customers') {
    text('name', true);
    text('contactName');
    text('contactPhone');
    text('address');
    text('note');
  } else {
    text('deviceNo', true);
    text('name', true);
    text('model');
    text('location');
    text('nextInspectionDate');
    if (body.customerId !== undefined || !partial) {
      values.customerId = toNumber(body.customerId) ?? null;
    }
    if (body.engineerProfileId !== undefined || !partial) {
      values.engineerProfileId = toNumber(body.engineerProfileId) ?? null;
    }
    if (body.serviceEngineerId !== undefined || !partial) {
      values.serviceEngineerId = body.serviceEngineerId
        ? asText(body.serviceEngineerId)
        : null;
    }
    if (body.status !== undefined || !partial) {
      const status = body.status;
      values.status =
        status === 'disabled' || status === 'maintenance'
          ? status
          : 'active';
    }
  }
  return values;
}

function orderError(context: Ctx, error: unknown) {
  if (error instanceof ServiceOrderError) {
    const status =
      error.code === 'ORDER_NOT_FOUND'
        ? 404
        : error.code === 'FORBIDDEN'
          ? 403
          : 422;
    return jsonError(context, status, error.code, error.message);
  }
  throw error;
}

function shareError(context: Ctx, error: unknown) {
  if (error instanceof ServiceShareError) {
    const status =
      error.code === 'ORDER_NOT_FOUND' || error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'CONFIDENTIAL'
          ? 409
          : 422;
    return jsonError(context, status, error.code, error.message);
  }
  throw error;
}

function knowledgeError(context: Ctx, error: unknown) {
  if (error instanceof ServiceKnowledgeError) {
    const status =
      error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 422;
    return jsonError(context, status, error.code, error.message);
  }
  throw error;
}

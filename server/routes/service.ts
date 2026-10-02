import { randomUUID } from 'node:crypto';

import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { loggingToken } from '@nocobase/app-server/logging';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  userAdministrationServiceToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import {
  AuthorizationDeniedError,
  type AuthorizationContext,
  type AuthorizationEnv,
} from '@nocobase/authorization/core';
import { getRequestLocale } from '@nocobase/i18n/server';
import {
  databaseManagerToken,
  type FilterBuilder,
  type FilterNode,
  type RepositoryFilter,
} from '@nocobase/db';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  attachmentContentError,
  attachmentContentErrorText,
} from '../service/attachments.js';
import {
  authorizeComposite,
  scopedConnection,
} from '../service/authorization.js';
import {
  invalid,
  isServiceError,
  notFound,
  unavailable,
} from '../service/errors.js';
import { triggerAcceptanceWorkflow } from '../service/acceptance.js';
import type {
  ServiceEngineerGroupRow,
  ServiceEngineerProfileRow,
} from '../service/models.js';
import type { WorkOrderTransition } from '../service/work-orders.js';
import {
  dashboardServiceToken,
  inspectionServiceToken,
  integrationServiceToken,
  serviceAttachmentServiceToken,
  workOrderServiceToken,
} from '../service/tokens.js';

/**
 * The two environments the service routes need: the session `auth.required()` sets and the `authz` context.
 *
 * The two interfaces cannot be extended together because each declares its own `Variables` property; the
 * intersection merges them into one map carrying both `auth` and `authz`.
 */
interface ServiceRouteEnv {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
}

type ServiceContext = Context<ServiceRouteEnv>;
type RecordBuilder = FilterBuilder<Record<string, unknown>>;
type ConditionBuilder = (builder: RecordBuilder) => FilterNode;

function queryObject(
  context: ServiceContext,
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, values] of Object.entries(context.req.queries())) {
    result[key] = values[0];
  }
  return result;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asTrimmed(value: unknown): string | undefined {
  const text = asString(value);
  return text === undefined ? undefined : text.trim();
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function asDateValue(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
}

function requiredString(value: unknown, message: string): string {
  const text = asTrimmed(value);
  if (!text) throw invalid(message);
  return text;
}

function requiredNumber(value: unknown, message: string): number {
  const parsed = asNumber(value);
  if (parsed === undefined) throw invalid(message);
  return parsed;
}

function requireId(context: ServiceContext): number {
  const id = asNumber(context.req.param('id'));
  if (id === undefined) throw invalid('A valid identifier is required.');
  return id;
}

/**
 * Whether a thrown database error is a unique-constraint violation. The driver error is wrapped by the
 * repository, so the check walks the cause chain and recognizes each dialect's code.
 */
function isUniqueConstraintViolation(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);
    const record = current as Record<string, unknown>;
    const code = record.code;
    const number = record.errno ?? record.number ?? record.errorNum;
    if (
      record.errCode === -6602 ||
      code === '23505' ||
      code === 'ER_DUP_ENTRY' ||
      code === 'SQLITE_CONSTRAINT' ||
      code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
      number === 1 ||
      number === 1062 ||
      number === 2601 ||
      number === 2627
    ) {
      return true;
    }
    current = record.cause ?? record.originalError;
  }
  return false;
}

/** Run a repository write, turning a unique-constraint violation into the configured validation error. */
async function withDuplicateMessage<T>(
  operation: () => Promise<T>,
  duplicateMessage: string | undefined,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw invalid(
        duplicateMessage ??
          'A record with the same unique value already exists.',
      );
    }
    throw error;
  }
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

function pagination(query: Record<string, string | undefined>): {
  limit: number;
  offset: number;
} {
  const limit = Math.min(
    Math.max(asNumber(query.limit) ?? DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  const offset = Math.max(asNumber(query.offset) ?? 0, 0);
  return { limit, offset };
}

/**
 * Combine a list of lazy conditions into one filter.
 *
 * An empty list becomes the empty shorthand — a filter that matches every readable row — rather than an empty
 * `and` group, and a single condition is returned bare. This keeps the generated query exactly as narrow as the
 * client asked for and no narrower.
 */
function combined(
  conditions: readonly ConditionBuilder[],
): RepositoryFilter<Record<string, unknown>> | undefined {
  // No conditions means every readable row. `{}` is not a valid filter shorthand — the repository rejects an
  // empty one — so an unrestricted read is expressed by omitting the filter entirely.
  if (conditions.length === 0) return undefined;
  return (builder) => {
    const nodes = conditions.map((condition) => condition(builder));
    return nodes.length === 1 ? nodes[0] : builder.and(nodes);
  };
}

interface EntityConfig {
  readonly path: string;
  readonly resource: string;
  readonly collection: string;
  readonly sortField: string;
  readonly filter: (
    query: Record<string, string | undefined>,
  ) => RepositoryFilter<Record<string, unknown>> | undefined;
  readonly createValues: (
    body: Record<string, unknown>,
    context: AuthorizationContext,
  ) => Record<string, unknown>;
  readonly updateValues: (
    body: Record<string, unknown>,
  ) => Record<string, unknown>;
  /** Message for a rejected unique value; when present a constraint violation becomes a 422 instead of a 500. */
  readonly duplicateMessage?: string;
}

/**
 * The application's business HTTP surface, mounted at `/api/service`.
 *
 * Every route owns its own security: the session is required and the authorization middleware resolves the
 * request's `authz` context for the whole sub-router. Each handler then authorizes exactly one composite action
 * through `authorizeComposite`, which both decides and returns the database policies the operation runs under.
 * A route never trusts the client for a scope, and never reads a collection outside a scoped connection.
 */
export function createServiceApiRouter(app: Application): Hono {
  const container = app.container;
  const authentication = container.resolve(authenticationToken);
  const authorization = container.resolve(authorizationToken);
  const database = container.resolve(databaseManagerToken);
  const drive = container.resolve(driveManagerToken);
  const logger = container
    .resolve(loggingToken)
    .getLogger('nb3-factory/service-api');
  const workOrders = container.resolve(workOrderServiceToken);
  const inspections = container.resolve(inspectionServiceToken);
  const integration = container.resolve(integrationServiceToken);
  const dashboard = container.resolve(dashboardServiceToken);
  const attachments = container.resolve(serviceAttachmentServiceToken);

  const diskName = (): string => {
    const config = app.config.get<{ default?: string }>('drive');
    return config?.default ?? 'local';
  };

  /**
   * Persisted text (notifications, notes) is written once, so it follows the language the request was made in
   * rather than the reader's later preference. These helpers keep that choice explicit.
   */
  const prefersChinese = (locale: string | null | undefined): boolean =>
    Boolean(locale?.toLowerCase().startsWith('zh'));
  const localized = (
    locale: string | null | undefined,
    english: string,
    chinese: string,
  ): string => (prefersChinese(locale) ? chinese : english);

  /**
   * Deliver one durable in-app message. A failure to deliver must not fail the business operation that caused
   * it: the state transition is the transaction, the message is a notification about it.
   */
  const notify = async (input: {
    idempotencyKey: string;
    workOrderId: number;
    to: string;
    title: string;
    body: string;
  }): Promise<void> => {
    try {
      await container.resolve(notificationServiceToken).send({
        idempotencyKey: input.idempotencyKey,
        source: {
          type: 'service-work-order',
          referenceId: String(input.workOrderId),
        },
        messages: {
          inbox: {
            to: input.to,
            title: input.title,
            body: input.body,
            target: {
              type: 'route',
              path: `/service/work-orders/${input.workOrderId}`,
            },
          },
        },
      });
    } catch (error) {
      logger.warn(
        `Could not deliver the work-order notification: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  const scopedRepository = async (
    context: AuthorizationContext,
    resource: string,
    action: string,
    collection: string,
  ) => {
    const policies = await authorizeComposite(context, resource, action);
    return scopedConnection(
      database,
      context.identity.principal,
      policies,
    ).repository<Record<string, unknown>>(collection);
  };

  const registerEntity = (
    service: Hono<ServiceRouteEnv>,
    config: EntityConfig,
  ): void => {
    service.get(`/${config.path}`, async (context) => {
      const query = queryObject(context);
      const { limit, offset } = pagination(query);
      const repository = await scopedRepository(
        context.get('authz'),
        config.resource,
        'view',
        config.collection,
      );
      const filter = config.filter(query);
      const items = await repository.findMany({
        filter,
        sort: (sort) => sort.field(config.sortField).desc(),
        limit,
        offset,
      });
      const total = await repository.count({ filter });
      return context.json({ data: { items, total, limit, offset } });
    });

    service.post(`/${config.path}`, async (context) => {
      const authz = context.get('authz');
      const body = await context.req.json<Record<string, unknown>>();
      const repository = await scopedRepository(
        authz,
        config.resource,
        'manage',
        config.collection,
      );
      const at = new Date();
      const created = await withDuplicateMessage(
        () =>
          repository.createOne({
            values: {
              ...config.createValues(body, authz),
              createdAt: at,
              updatedAt: at,
            },
          }),
        config.duplicateMessage,
      );
      return context.json({ data: created.record }, 201);
    });

    service.patch(`/${config.path}/:id`, async (context) => {
      const id = requireId(context);
      const body = await context.req.json<Record<string, unknown>>();
      const repository = await scopedRepository(
        context.get('authz'),
        config.resource,
        'manage',
        config.collection,
      );
      const existing = await repository.findOne({ filter: { id } });
      if (!existing) throw notFound('The record does not exist.');
      const updated = await withDuplicateMessage(
        () =>
          repository.updateOne({
            filter: { id },
            values: { ...config.updateValues(body), updatedAt: new Date() },
          }),
        config.duplicateMessage,
      );
      return context.json({ data: updated.record });
    });

    service.delete(`/${config.path}/:id`, async (context) => {
      const id = requireId(context);
      const repository = await scopedRepository(
        context.get('authz'),
        config.resource,
        'manage',
        config.collection,
      );
      const existing = await repository.findOne({ filter: { id } });
      if (!existing) throw notFound('The record does not exist.');
      await repository.deleteOne({ filter: { id } });
      return context.body(null, 204);
    });
  };

  // The contribution is mounted at `/api`; the business surface of this application lives one segment below it,
  // at `/api/service`, which is what the client calls. The base path carries the middleware too, so the session
  // requirement and the authorization context resolve for `/api/service/*` and nothing else.
  const service = new Hono<ServiceRouteEnv>().basePath('/service');

  service.use('*', authentication.required(), authorization.middleware());

  service.onError((error, context) => {
    if (isServiceError(error)) {
      return context.json(
        { code: error.code, message: error.message },
        error.status as ContentfulStatusCode,
      );
    }
    if (error instanceof AuthorizationDeniedError) {
      return context.json(
        { code: 'FORBIDDEN', message: 'You do not have permission.' },
        403,
      );
    }
    throw error;
  });

  // ------------------------------------------------------------------------------------------------ dashboard

  service.get('/dashboard', async (context) => {
    const summary = await dashboard.summary(context.get('authz'));
    return context.json({ data: summary });
  });

  // ----------------------------------------------------------------------------------------------- work orders

  service.get('/work-orders', async (context) => {
    const query = queryObject(context);
    const result = await workOrders.list(context.get('authz'), {
      status: query.status,
      priority: query.priority,
      assigneeId: query.assigneeId,
      source: query.source,
      customerId: asNumber(query.customerId),
      equipmentId: asNumber(query.equipmentId),
      keyword: query.keyword,
      limit: asNumber(query.limit),
      offset: asNumber(query.offset),
    });
    return context.json({ data: result });
  });

  service.get('/work-orders/:id', async (context) => {
    const detail = await workOrders.get(
      context.get('authz'),
      requireId(context),
    );
    return context.json({ data: detail });
  });

  service.post('/work-orders', async (context) => {
    const authz = context.get('authz');
    const body = await context.req.json<Record<string, unknown>>();
    const created = await workOrders.create(authz, {
      title: requiredString(body.title, 'A title is required.'),
      customerId: requiredNumber(body.customerId, 'A customer is required.'),
      equipmentId: requiredNumber(
        body.equipmentId,
        'An equipment is required.',
      ),
      description: asString(body.description) ?? null,
      priority: asString(body.priority),
      confidential: asBoolean(body.confidential),
      deadline: asDateValue(body.deadline),
      assigneeId: asString(body.assigneeId) ?? null,
      reporterId: asString(body.reporterId) ?? null,
      source: asString(body.source),
      locale: getRequestLocale(context) ?? null,
    });
    // Auto-acceptance ran inside the service through the source-managed workflow; report the row as it stands
    // after the trigger so the caller sees the accepted status and assignee.
    const current = await workOrders.get(authz, created.id);
    return context.json({ data: current.workOrder }, 201);
  });

  // Acceptance is a source-managed Workflow action: the route authorizes and validates, then triggers the
  // workflow whose run module performs the transition, records the note and sends the message.
  service.post('/work-orders/:id/accept', async (context) => {
    const id = requireId(context);
    const body = await context.req
      .json<Record<string, unknown>>()
      .catch((): Record<string, unknown> => ({}));
    await workOrders.requestAcceptance(context.get('authz'), id);
    const receipt = await triggerAcceptanceWorkflow(container, {
      workOrderId: id,
      mode: 'manual',
      actorId: context.get('authz').identity.principal.id,
      assigneeId: asString(body.assigneeId) ?? null,
      locale: getRequestLocale(context) ?? null,
    });
    if (receipt.status === 'skipped') {
      throw unavailable(
        'The work-order acceptance workflow is not enabled. Enable it under Workflows and try again.',
      );
    }
    const detail = await workOrders.get(context.get('authz'), id);
    return context.json({
      data: {
        workOrder: detail.workOrder,
        event: detail.events[detail.events.length - 1] ?? null,
      },
    });
  });

  service.patch('/work-orders/:id', async (context) => {
    const body = await context.req.json<Record<string, unknown>>();
    const updated = await workOrders.update(
      context.get('authz'),
      requireId(context),
      {
        title: asTrimmed(body.title),
        description: asString(body.description),
        priority: asString(body.priority),
        confidential: asBoolean(body.confidential),
        deadline: asDateValue(body.deadline),
        assigneeId: body.assigneeId === null ? null : asString(body.assigneeId),
        supervisorId:
          body.supervisorId === null ? null : asString(body.supervisorId),
        resolutionNote:
          body.resolutionNote === null ? null : asString(body.resolutionNote),
      },
    );
    return context.json({ data: updated });
  });

  const transitions: readonly WorkOrderTransition[] = [
    'start',
    'submit',
    'confirm',
    'return',
  ];
  for (const transition of transitions) {
    service.post(`/work-orders/:id/${transition}`, async (context) => {
      const id = requireId(context);
      const body = await context.req
        .json<Record<string, unknown>>()
        .catch((): Record<string, unknown> => ({}));
      const result = await workOrders.transition(
        context.get('authz'),
        id,
        transition,
        {
          note: asString(body.note) ?? null,
          resolutionNote: asString(body.resolutionNote) ?? null,
          returnReason: asString(body.returnReason) ?? null,
          assigneeId:
            body.assigneeId === null ? null : asString(body.assigneeId),
        },
      );
      const label = result.workOrder.code ?? String(result.workOrder.id);
      const locale = getRequestLocale(context) ?? null;
      if (transition === 'return' && result.workOrder.assigneeId) {
        await notify({
          idempotencyKey: `service-work-order:${id}:returned:${result.event.id}`,
          workOrderId: id,
          to: result.workOrder.assigneeId,
          title: localized(locale, 'Work order returned', '工单被退回'),
          body: localized(
            locale,
            `Work order ${label} "${result.workOrder.title}" was returned; please rework it.`,
            `工单 ${label}「${result.workOrder.title}」被退回，请重新处理。`,
          ),
        });
      } else if (transition === 'submit') {
        const supervisor =
          result.workOrder.supervisorId ?? result.workOrder.createdById;
        if (supervisor) {
          await notify({
            idempotencyKey: `service-work-order:${id}:submitted:${result.event.id}`,
            workOrderId: id,
            to: supervisor,
            title: localized(
              locale,
              'Work order awaiting confirmation',
              '工单待确认',
            ),
            body: localized(
              locale,
              `An engineer submitted work order ${label} "${result.workOrder.title}"; please confirm it.`,
              `工程师已提交工单 ${label}「${result.workOrder.title}」，请确认。`,
            ),
          });
        }
      } else if (transition === 'confirm' && result.workOrder.assigneeId) {
        await notify({
          idempotencyKey: `service-work-order:${id}:confirmed:${result.event.id}`,
          workOrderId: id,
          to: result.workOrder.assigneeId,
          title: localized(
            locale,
            'Work order confirmed and closed',
            '工单已确认关闭',
          ),
          body: localized(
            locale,
            `Work order ${label} "${result.workOrder.title}" was confirmed and closed.`,
            `工单 ${label}「${result.workOrder.title}」已被确认关闭。`,
          ),
        });
      }
      return context.json({ data: result });
    });
  }

  service.post('/work-orders/:id/shares', async (context) => {
    const id = requireId(context);
    const body = await context.req.json<Record<string, unknown>>();
    const engineerId = requiredString(
      body.engineerId,
      'An engineer is required.',
    );
    const share = await workOrders.share(context.get('authz'), id, engineerId);
    const detail = await workOrders.get(context.get('authz'), id);
    const locale = getRequestLocale(context) ?? null;
    await notify({
      idempotencyKey: `service-work-order:${id}:shared:${share.id}`,
      workOrderId: id,
      to: engineerId,
      title: localized(locale, 'Work order shared with you', '工单已共享给您'),
      body: localized(
        locale,
        `Work order ${detail.workOrder.code ?? id} "${detail.workOrder.title}" was shared with you for reference.`,
        `工单 ${detail.workOrder.code ?? id}「${detail.workOrder.title}」已共享给您查阅。`,
      ),
    });
    return context.json({ data: share }, 201);
  });

  service.delete('/work-orders/:id/shares/:shareId', async (context) => {
    const shareId = asNumber(context.req.param('shareId'));
    if (shareId === undefined) throw invalid('A valid share is required.');
    const share = await workOrders.revokeShare(
      context.get('authz'),
      requireId(context),
      shareId,
    );
    return context.json({ data: share });
  });

  service.delete('/work-orders/:id', async (context) => {
    await workOrders.remove(context.get('authz'), requireId(context));
    return context.body(null, 204);
  });

  // ----------------------------------------------------------------------------------------------- attachments

  service.post('/work-orders/:id/attachments', async (context) => {
    const id = requireId(context);
    const body = await context.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      throw invalid('A file is required.');
    }
    const filename = file.name || 'attachment';
    const ext = (filename.split('.').pop() ?? '').toLowerCase();
    const locale = getRequestLocale(context) ?? null;
    if (
      !ALLOWED_ATTACHMENT_EXTENSIONS.includes(
        ext as (typeof ALLOWED_ATTACHMENT_EXTENSIONS)[number],
      )
    ) {
      throw invalid(attachmentContentErrorText('unsupported-type', locale));
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentError = attachmentContentError(ext, bytes);
    if (contentError) {
      throw invalid(attachmentContentErrorText(contentError, locale));
    }
    const key = `service-attachments/${id}/${randomUUID()}.${ext}`;
    const mimeType = file.type || 'application/octet-stream';
    await drive.use().put(key, bytes, { contentType: mimeType });
    const created = await attachments.create(context.get('authz'), {
      workOrderId: id,
      disk: diskName(),
      key,
      filename,
      ext,
      mimeType,
      size: bytes.byteLength,
    });
    return context.json({ data: created }, 201);
  });

  service.get('/attachments/:id/content', async (context) => {
    const attachment = await attachments.get(
      context.get('authz'),
      context.req.param('id'),
    );
    if (!attachment) throw notFound('The attachment does not exist.');
    const bytes = await drive.use(attachment.disk).getBytes(attachment.key);
    const disposition =
      context.req.query('download') === '1' ? 'attachment' : 'inline';
    return new Response(bytes, {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(
          attachment.filename,
        )}`,
        'Cache-Control': 'private, no-store',
      },
    });
  });

  service.delete('/attachments/:id', async (context) => {
    await attachments.remove(context.get('authz'), context.req.param('id'));
    return context.body(null, 204);
  });

  // ------------------------------------------------------------------------------------------------- ledger

  registerEntity(service, {
    path: 'customers',
    resource: 'service.customers',
    collection: 'serviceCustomers',
    sortField: 'createdAt',
    filter: (query) =>
      combined([
        ...(query.keyword
          ? [
              (builder: RecordBuilder) =>
                builder
                  .string('name')
                  .includes(query.keyword ?? '', { mode: 'insensitive' }),
            ]
          : []),
      ]),
    createValues: (body) => ({
      name: requiredString(body.name, 'A customer name is required.'),
      code: asTrimmed(body.code) ?? null,
      level: asString(body.level) ?? null,
      contact: asString(body.contact) ?? null,
      phone: asString(body.phone) ?? null,
      address: asString(body.address) ?? null,
    }),
    updateValues: (body) => {
      const values: Record<string, unknown> = {};
      for (const field of [
        'name',
        'code',
        'level',
        'contact',
        'phone',
        'address',
      ]) {
        if (field in body) {
          values[field] =
            body[field] === null ? null : (asString(body[field]) ?? null);
        }
      }
      return values;
    },
  });

  registerEntity(service, {
    path: 'equipment',
    resource: 'service.equipment',
    collection: 'serviceEquipment',
    sortField: 'createdAt',
    duplicateMessage: 'An equipment with this code already exists.',
    filter: (query) =>
      combined([
        ...(query.customerId
          ? [
              (builder: RecordBuilder) =>
                builder
                  .number('customerId')
                  .eq(asNumber(query.customerId) ?? -1),
            ]
          : []),
        ...(query.engineerId
          ? [
              (builder: RecordBuilder) =>
                builder.string('engineerId').eq(query.engineerId ?? ''),
            ]
          : []),
        ...(query.status
          ? [
              (builder: RecordBuilder) =>
                builder.string('status').eq(query.status ?? ''),
            ]
          : []),
        ...(query.keyword
          ? [
              (builder: RecordBuilder) =>
                builder
                  .string('name')
                  .includes(query.keyword ?? '', { mode: 'insensitive' }),
            ]
          : []),
      ]),
    createValues: (body) => ({
      code: requiredString(body.code, 'An equipment code is required.'),
      name: requiredString(body.name, 'An equipment name is required.'),
      model: asString(body.model) ?? null,
      serialNumber: asString(body.serialNumber) ?? null,
      location: asString(body.location) ?? null,
      status: asString(body.status) ?? 'active',
      customerId: requiredNumber(body.customerId, 'A customer is required.'),
      engineerId:
        body.engineerId === null ? null : (asString(body.engineerId) ?? null),
      enabled: asBoolean(body.enabled) ?? true,
      nextInspectionDate: asDateValue(body.nextInspectionDate) ?? null,
      warrantyUntil: asDateValue(body.warrantyUntil) ?? null,
    }),
    updateValues: (body) => {
      const values: Record<string, unknown> = {};
      for (const field of [
        'name',
        'model',
        'serialNumber',
        'location',
        'status',
        'code',
      ]) {
        if (field in body) {
          values[field] =
            body[field] === null ? null : (asString(body[field]) ?? null);
        }
      }
      if ('customerId' in body) values.customerId = asNumber(body.customerId);
      if ('engineerId' in body) {
        values.engineerId =
          body.engineerId === null ? null : (asString(body.engineerId) ?? null);
      }
      if ('enabled' in body) values.enabled = asBoolean(body.enabled);
      if ('nextInspectionDate' in body) {
        values.nextInspectionDate =
          asDateValue(body.nextInspectionDate) ?? null;
      }
      if ('warrantyUntil' in body) {
        values.warrantyUntil = asDateValue(body.warrantyUntil) ?? null;
      }
      return values;
    },
  });

  registerEntity(service, {
    path: 'knowledge',
    resource: 'service.knowledge',
    collection: 'serviceRepairKnowledge',
    sortField: 'createdAt',
    filter: (query) =>
      combined([
        ...(query.category
          ? [
              (builder: RecordBuilder) =>
                builder.string('category').eq(query.category ?? ''),
            ]
          : []),
        ...(query.published
          ? [
              (builder: RecordBuilder) =>
                query.published === 'true'
                  ? builder.boolean('published').isTrue()
                  : builder.boolean('published').isFalse(),
            ]
          : []),
        ...(query.keyword
          ? [
              (builder: RecordBuilder) =>
                builder
                  .string('title')
                  .includes(query.keyword ?? '', { mode: 'insensitive' }),
            ]
          : []),
      ]),
    createValues: (body, context) => ({
      title: requiredString(body.title, 'A title is required.'),
      category: asString(body.category) ?? null,
      tags: asString(body.tags) ?? null,
      symptom: asString(body.symptom) ?? null,
      content: asString(body.content) ?? null,
      published: asBoolean(body.published) ?? false,
      createdById: context.identity.principal.id,
    }),
    updateValues: (body) => {
      const values: Record<string, unknown> = {};
      for (const field of ['title', 'category', 'tags', 'symptom', 'content']) {
        if (field in body) {
          values[field] =
            body[field] === null ? null : (asString(body[field]) ?? null);
        }
      }
      if ('published' in body) values.published = asBoolean(body.published);
      if ('viewCount' in body) values.viewCount = asNumber(body.viewCount);
      return values;
    },
  });

  registerEntity(service, {
    path: 'manuals',
    resource: 'service.manuals',
    collection: 'serviceManuals',
    sortField: 'createdAt',
    filter: (query) =>
      combined([
        ...(query.equipmentId
          ? [
              (builder: RecordBuilder) =>
                builder
                  .number('equipmentId')
                  .eq(asNumber(query.equipmentId) ?? -1),
            ]
          : []),
        ...(query.published
          ? [
              (builder: RecordBuilder) =>
                query.published === 'true'
                  ? builder.boolean('published').isTrue()
                  : builder.boolean('published').isFalse(),
            ]
          : []),
        ...(query.keyword
          ? [
              (builder: RecordBuilder) =>
                builder
                  .string('title')
                  .includes(query.keyword ?? '', { mode: 'insensitive' }),
            ]
          : []),
      ]),
    createValues: (body) => ({
      title: requiredString(body.title, 'A title is required.'),
      version: asTrimmed(body.version) ?? '1.0',
      equipmentId: requiredNumber(
        body.equipmentId,
        'An equipment is required.',
      ),
      summary: asString(body.summary) ?? null,
      content: asString(body.content) ?? null,
      driveKey: asString(body.driveKey) ?? null,
      filename: asString(body.filename) ?? null,
      published: asBoolean(body.published) ?? true,
    }),
    updateValues: (body) => {
      const values: Record<string, unknown> = {};
      for (const field of [
        'title',
        'version',
        'summary',
        'content',
        'driveKey',
        'filename',
      ]) {
        if (field in body) {
          values[field] =
            body[field] === null ? null : (asString(body[field]) ?? null);
        }
      }
      if ('equipmentId' in body)
        values.equipmentId = asNumber(body.equipmentId);
      if ('published' in body) values.published = asBoolean(body.published);
      return values;
    },
  });

  // ------------------------------------------------------------------------------------------------ inspections

  service.get('/inspections', async (context) => {
    const query = queryObject(context);
    const result = await inspections.list(context.get('authz'), {
      status: query.status,
      assigneeId: query.assigneeId,
      equipmentId: asNumber(query.equipmentId),
      limit: asNumber(query.limit),
      offset: asNumber(query.offset),
    });
    return context.json({ data: result });
  });

  service.post('/inspections', async (context) => {
    const body = await context.req.json<Record<string, unknown>>();
    const created = await inspections.create(context.get('authz'), {
      equipmentId: requiredNumber(
        body.equipmentId,
        'An equipment is required.',
      ),
      planDate: asDateValue(body.planDate),
      dueDate: asDateValue(body.dueDate),
      assigneeId: body.assigneeId === null ? null : asString(body.assigneeId),
    });
    return context.json({ data: created }, 201);
  });

  service.post('/inspections/:id/complete', async (context) => {
    const body = await context.req.json<Record<string, unknown>>();
    const completed = await inspections.complete(
      context.get('authz'),
      requireId(context),
      {
        result: requiredString(
          body.result,
          'An inspection result is required.',
        ),
      },
    );
    return context.json({ data: completed });
  });

  // The scheduler owns the daily runs; these two endpoints let a supervisor execute the same sweep on demand.
  // Authorization is the composite's `create` action, which only the supervisor permission set grants.
  service.post('/inspections/generate', async (context) => {
    await authorizeComposite(
      context.get('authz'),
      'service.inspections',
      'create',
    );
    const result = await inspections.generatePlans();
    return context.json({
      data: { created: result.created, inspections: result.inspections },
    });
  });

  service.post('/inspections/overdue', async (context) => {
    await authorizeComposite(
      context.get('authz'),
      'service.inspections',
      'create',
    );
    const result = await inspections.flagOverdue();
    return context.json({
      data: {
        workOrders: result.workOrders,
        notified: result.notified,
      },
    });
  });

  // ------------------------------------------------------------------------------------------------- directory

  service.get('/directory', async (context) => {
    const authz = context.get('authz');
    const policies = await authorizeComposite(
      authz,
      'service.directory',
      'view',
    );
    const connection = scopedConnection(
      database,
      authz.identity.principal,
      policies,
    );
    const groups = await connection
      .repository<ServiceEngineerGroupRow>('serviceEngineerGroups')
      .findMany({ sort: (sort) => sort.field('code').asc() });
    const profiles = await connection
      .repository<ServiceEngineerProfileRow>('serviceEngineerProfiles')
      .findMany({ sort: (sort) => sort.field('createdAt').asc() });
    const users = await container.resolve(userAdministrationServiceToken).list({
      userIds: profiles.map((profile) => profile.userId),
      pageSize: 200,
    });
    const nameById = new Map(users.items.map((user) => [user.id, user.name]));
    return context.json({
      data: {
        groups,
        profiles: profiles.map((profile) => ({
          ...profile,
          name: nameById.get(profile.userId) ?? profile.userId,
        })),
      },
    });
  });

  // ----------------------------------------------------------------------------------------------- integration

  service.get('/integration/events', async (context) => {
    const query = queryObject(context);
    const result = await integration.listMine(context.get('authz'), {
      status: query.status,
      limit: asNumber(query.limit),
      offset: asNumber(query.offset),
    });
    return context.json({ data: result });
  });

  service.post('/integration/events', async (context) => {
    const body = await context.req.json<Record<string, unknown>>();
    const result = await integration.ingest(context.get('authz'), {
      externalEventId: requiredString(
        body.externalEventId,
        'An external event id is required.',
      ),
      title: requiredString(body.title, 'A title is required.'),
      equipmentId: requiredNumber(
        body.equipmentId,
        'An equipment is required.',
      ),
      description: asString(body.description) ?? null,
      priority: asString(body.priority),
      eventType: asString(body.eventType) ?? null,
      source: asString(body.source) ?? null,
      deadline: asDateValue(body.deadline),
      payload: body.payload,
    });
    return context.json({ data: result }, result.duplicate ? 200 : 201);
  });

  service.get('/integration/events/:externalEventId', async (context) => {
    const result = await integration.status(
      context.get('authz'),
      context.req.param('externalEventId'),
    );
    if (!result) throw notFound('The event does not exist.');
    return context.json({ data: result });
  });

  return service as unknown as Hono;
}

/** The application's business API route contribution, mounted under `/api/service`. */
export const apiRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes<Application>((app) => createServiceApiRouter(app));

export default apiRoutes;

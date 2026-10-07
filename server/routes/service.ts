import type { Application } from '@nocobase/app-server/application';
import type { AppApiRouteContribution } from '@nocobase/app-server/router';
import {
  ApiError,
  apiErrorResponse,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  emptyResponse,
  listResponse,
  parseApiInput,
} from '@nocobase/app-server/router';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import {
  AuthorizationDeniedError,
  type AuthorizationEnv,
} from '@nocobase/authorization/core';
import {
  databaseManagerToken,
  narrowRepositoryPolicy,
  normalizeRepositoryPolicy,
  type DatabaseManager,
  type NormalizedRepositoryPolicy,
  type PartialRepositoryPolicy,
  type RepositoryPolicy,
} from '@nocobase/db';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { getRequestTranslator } from '@nocobase/i18n/server';
import { Hono, type Context } from 'hono';
import { Readable } from 'node:stream';
import { z } from 'zod';

import {
  COLLECTIONS,
  SERVICE_RESOURCES,
  WORK_ORDER_ACTIONS,
  WorkOrderError,
  createNotifier,
  permissionActionFor,
  type ServiceContext,
  type WorkOrderAction,
  type WorkOrderView,
} from '../service/index.js';
import { serviceToken } from '../service/tokens.js';
import {
  AssistantStatusViewSchema,
  AttachmentForm,
  AttachmentViewSchema,
  CompleteInspectionInput,
  CreateCustomerInput,
  CreateDeviceInput,
  CreateManualInput,
  CreateRepairNoteInput,
  CreateWorkOrderInput,
  CustomerViewSchema,
  DeviceViewSchema,
  ExternalTicketAcceptedViewSchema,
  ExternalTicketInput,
  ExternalTicketParams,
  ExternalTicketViewSchema,
  IdParam,
  InspectionTaskViewSchema,
  ListQuery,
  ManualViewSchema,
  OverdueReminderViewSchema,
  OverviewViewSchema,
  PageMetaSchema,
  PageQuery,
  ScheduledRunQuery,
  RepairNoteViewSchema,
  RunTaskInput,
  ScheduledRunViewSchema,
  ServiceGroupViewSchema,
  ShareInput,
  ShareTargetViewSchema,
  TaskKeyParam,
  TaskListViewSchema,
  TaskRunResultViewSchema,
  TransitionInput,
  UpdateCustomerInput,
  UpdateDeviceInput,
  WorkOrderActionParam,
  WorkOrderDetailViewSchema,
  WorkOrderListQuery,
  WorkOrderShareViewSchema,
  WorkOrderViewSchema,
} from './schemas.js';

const TAG = 'Service';

/** The largest attachment the application accepts; the route enforces it itself. */
const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

const SERVICE_TAGS: { tags: string[] } = { tags: [TAG] };

/**
 * The first path segment of every route this contribution owns.
 *
 * The authentication and authorization middleware are installed per prefix
 * rather than with a router-wide `use('*', ...)`. Every API contribution is
 * merged into one router mounted at `/api`, so a wildcard there would run for
 * sibling contributions too and turn an unknown `/api/...` path into a `401`
 * instead of the router's `404`. Every route's first segment has to be listed
 * here; a prefix that is missing means those routes run without the request's
 * authentication and authorization context, which fails the route-level tests.
 */
const SERVICE_ROUTE_PREFIXES = [
  '/assistant',
  '/customers',
  '/devicePlatform',
  '/devices',
  '/inspectionTasks',
  '/manuals',
  '/overdueReminders',
  '/overview',
  '/repairNotes',
  '/scheduledRuns',
  '/serviceGroups',
  '/serviceTasks',
  '/workOrders',
] as const;

/** The request-scoped environment every route in this file runs under. */
export type ServiceEnv = AuthEnv &
  AuthorizationEnv & {
    Variables: { serviceContext: ServiceContext };
  };

type ServiceRequestContext = Context<ServiceEnv>;

interface AccessRequest {
  readonly resource: string;
  readonly action: string;
}

const read = (resource: string, action = 'view'): AccessRequest => ({
  resource,
  action,
});

const customerView = read(SERVICE_RESOURCES.customers);
const customerMaintain = read(SERVICE_RESOURCES.customers, 'maintain');
const deviceView = read(SERVICE_RESOURCES.devices);
const deviceMaintain = read(SERVICE_RESOURCES.devices, 'maintain');
const workOrderView = read(SERVICE_RESOURCES.workOrders);
const workOrderCreate = read(SERVICE_RESOURCES.workOrders, 'create');
const workOrderAttach = read(SERVICE_RESOURCES.workOrders, 'attach');
const workOrderShare = read(SERVICE_RESOURCES.workOrders, 'share');
const repairNoteView = read(SERVICE_RESOURCES.repairNotes);
const repairNotePublish = read(SERVICE_RESOURCES.repairNotes, 'publish');
const manualView = read(SERVICE_RESOURCES.manuals);
const manualMaintain = read(SERVICE_RESOURCES.manuals, 'maintain');
const inspectionView = read(SERVICE_RESOURCES.inspections);
const inspectionComplete = read(SERVICE_RESOURCES.inspections, 'complete');
const reportView = read(SERVICE_RESOURCES.reports);
const systemRunTask = read(SERVICE_RESOURCES.system, 'runTask');
const devicePlatformSubmit = read(SERVICE_RESOURCES.devicePlatform, 'submit');
const devicePlatformRead = read(SERVICE_RESOURCES.devicePlatform, 'read');

/**
 * Narrows two decisions' collection policies into one map.
 *
 * Two actions on the same collection are two independent limits, so their
 * policies are narrowed together rather than letting the last one replace the
 * earlier.
 *
 * Each composite action grants a different operation on the same Collection:
 * `view` grants `read`, an `accept` grants `update`, and neither grants the
 * other. Merging them per operation — intersect the scopes two decisions both
 * constrain, and take the one a single decision constrains — keeps a read
 * scoped by `view` while still letting `accept` update. Intersecting the whole
 * policies instead would let one action's `update: false` erase the other's
 * `update` scope; replacing them wholesale (the shape this replaced) would let
 * the last action's broad `read` widen the first action's narrower one.
 */
function mergeDecisionPolicies(
  target: Record<string, RepositoryPolicy>,
  database: Readonly<Record<string, RepositoryPolicy>> | undefined,
): void {
  if (!database) return;
  const operations = ['read', 'create', 'update', 'delete'] as const;
  for (const [collection, raw] of Object.entries(database)) {
    const patch = normalizeRepositoryPolicy(raw);
    const current = target[collection] as NormalizedRepositoryPolicy | undefined;
    if (!current) {
      target[collection] = patch;
      continue;
    }
    // Only an operation both decisions constrain is intersected. `false` on
    // one side means that decision has nothing to say here, so the other
    // side's scope stands rather than being ANDed with a denial.
    const both: Record<string, unknown> = {};
    for (const operation of operations) {
      if (current[operation] !== false && patch[operation] !== false) {
        both[operation] = patch[operation];
      }
    }
    const narrowed = narrowRepositoryPolicy(
      current,
      both as PartialRepositoryPolicy,
    );
    target[collection] = {
      read: current.read === false ? patch.read : narrowed.read,
      create: current.create === false ? patch.create : narrowed.create,
      update: current.update === false ? patch.update : narrowed.update,
      delete: current.delete === false ? patch.delete : narrowed.delete,
    };
  }
}

/**
 * Resolves the caller's database policies for one request.
 *
 * Every route names the composite actions it performs. A single `deny` stops the
 * request with the framework's own authorization error — which the `/api` error
 * handler renders as `403 PERMISSION_DENIED` — and the conditions of the
 * decisions that were reached merge into the policies the service reads and
 * writes through. An unrestricted identity (root) contributes none, which the
 * service treats as full access.
 */
async function serviceContext(
  context: ServiceRequestContext,
  requests: readonly AccessRequest[],
): Promise<ServiceContext> {
  const policies: Record<string, RepositoryPolicy> = {};
  for (const request of requests) {
    const decision = await context.var.authz.authorize({
      resource: { type: 'composite', id: request.resource },
      action: request.action,
    });
    if (decision.effect === 'deny') {
      throw new AuthorizationDeniedError(decision);
    }
    mergeDecisionPolicies(
      policies,
      decision.conditions?.database as
        | Readonly<Record<string, RepositoryPolicy>>
        | undefined,
    );
  }
  return { principalId: context.var.auth?.user?.id ?? null, policies };
}

/**
 * The lifecycle actions this caller may perform on any order they can reach.
 *
 * The vocabulary is the state machine's own (`start` moves an order into
 * processing), so what this returns can be posted back to the transition route
 * unchanged. Each action is checked against the permission it maps to, because
 * a grant names the capability rather than the transition.
 */
async function permittedActions(
  context: ServiceRequestContext,
): Promise<WorkOrderAction[]> {
  const permitted: WorkOrderAction[] = [];
  for (const action of WORK_ORDER_ACTIONS) {
    const decision = await context.var.authz.authorize({
      resource: { type: 'composite', id: SERVICE_RESOURCES.workOrders },
      action: permissionActionFor(action),
    });
    if (decision.effect !== 'deny') permitted.push(action);
  }
  return permitted;
}

/**
 * Narrows a capability list down to the actions this caller may actually
 * perform on one order.
 *
 * A grant names a capability and a scope; `permittedActions` only checks the
 * capability, so it reports what the caller may do to *some* order. Reading the
 * order through the same policies the transition route would bind proves the
 * record is inside every scope the action requires — an engineer who is merely
 * a temporary share recipient holds `process` but not on an order assigned to
 * somebody else, so it is not offered on that order.
 */
async function recordScopedActions(
  context: ServiceRequestContext,
  database: DatabaseManager,
  orderId: string,
  candidates: readonly WorkOrderAction[],
): Promise<WorkOrderAction[]> {
  if (!candidates.length) return [];
  const view = await context.var.authz.authorize({
    resource: { type: 'composite', id: SERVICE_RESOURCES.workOrders },
    action: 'view',
  });
  const allowed: WorkOrderAction[] = [];
  for (const action of candidates) {
    const decision = await context.var.authz.authorize({
      resource: { type: 'composite', id: SERVICE_RESOURCES.workOrders },
      action: permissionActionFor(action),
    });
    if (decision.effect === 'deny') continue;
    const policies: Record<string, RepositoryPolicy> = {};
    mergeDecisionPolicies(
      policies,
      view.conditions?.database as
        | Readonly<Record<string, RepositoryPolicy>>
        | undefined,
    );
    mergeDecisionPolicies(
      policies,
      decision.conditions?.database as
        | Readonly<Record<string, RepositoryPolicy>>
        | undefined,
    );
    const policy = policies[COLLECTIONS.workOrders];
    const base = database.repository<{ id: string }>(COLLECTIONS.workOrders);
    const scoped = policy ? base.withPolicy(policy as never) : base;
    const row = await scoped.findOne({ filter: { id: orderId } });
    if (row) allowed.push(action);
  }
  return allowed;
}

/** The `400` a malformed attachment upload answers, whatever part of it is wrong. */
function invalidFile(message: string): ApiError {
  return new ApiError({
    status: 'INVALID_ARGUMENT',
    reason: 'INVALID_FILE',
    domain: 'service',
    message,
  });
}

function notFound(reason: string, message: string): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason,
    domain: 'service',
    message,
  });
}

/**
 * Translates the service's domain errors into this route's error contract.
 *
 * A transition the state machine refuses is a failed precondition, not a bad
 * request: the body was well-formed and the caller may retry after the order
 * moves. The message is translated in the caller's own language.
 */
function toApiError(error: unknown, context: ServiceRequestContext): unknown {
  if (error instanceof WorkOrderError) {
    const status =
      error.status === 404
        ? ('NOT_FOUND' as const)
        : error.status === 409
          ? ('ALREADY_EXISTS' as const)
          : error.status >= 500
            ? ('UNAVAILABLE' as const)
            : ('FAILED_PRECONDITION' as const);
    const t = getRequestTranslator(context);
    return new ApiError({
      status,
      reason: error.reason,
      domain: 'service',
      message: t(`service.error.${error.reason}`, {
        defaultValue: error.message,
      }),
    });
  }
  return error;
}

/**
 * Announces one work-order activity to the people who should hear about it.
 *
 * Delivery is deliberately outside the transaction that committed the change and
 * never fails the request: the notification is a courtesy, the transition is the
 * fact. A workflow-driven acceptance announces itself through the workflow's own
 * notification node instead, which is why this lives in the route rather than
 * inside the service.
 */
async function announceTransition(
  context: ServiceRequestContext,
  notify: ReturnType<typeof createNotifier> | undefined,
  detail: WorkOrderView,
  action: string,
  idempotencyKey: string | null | undefined,
): Promise<void> {
  if (!notify) return;
  const recipients = [detail.assigneeId, detail.createdById].filter(
    (id): id is string => !!id && id !== context.var.auth?.user?.id,
  );
  if (!recipients.length) return;
  const t = getRequestTranslator(context);
  await notify.send({
    idempotencyKey: `service:${detail.id}:${action}:${idempotencyKey ?? 'once'}`,
    workOrderId: detail.id,
    userIds: recipients,
    title: t(`service.notify.${action}.title`, {
      defaultValue: t('service.notify.title', { defaultValue: detail.orderNo }),
      orderNo: detail.orderNo,
    }),
    body: t(`service.notify.${action}.body`, {
      defaultValue: t('service.notify.body', {
        defaultValue: '{{orderNo}} {{title}}',
        orderNo: detail.orderNo,
        title: detail.title,
      }),
      orderNo: detail.orderNo,
      title: detail.title,
    }),
    path: `/workOrders/${detail.id}`,
  });
}

export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  ({ container }) => {
    const service = container.resolve(serviceToken);
    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    const notify = container.has(notificationServiceToken)
      ? createNotifier(container.resolve(notificationServiceToken))
      : undefined;
    const router = new Hono<ServiceEnv>();
    for (const prefix of SERVICE_ROUTE_PREFIXES) {
      router.use(prefix, authentication.required(), authorization.middleware());
      router.use(
        `${prefix}/*`,
        authentication.required(),
        authorization.middleware(),
      );
    }

    const errors = {
      401: apiErrorResponse(401),
      403: apiErrorResponse(403),
      500: apiErrorResponse(500),
    };

    /**
     * Starts the source-managed acceptance workflow for one work order.
     *
     * The key is stable per order and per acceptance attempt: a retried request
     * with the same `idempotencyKey` wins the same event key, so the runtime
     * dedupes it instead of running the acceptance twice. A workflow that is
     * disabled or absent answers `skipped`; the caller records that as a real
     * automatic-acceptance failure rather than reporting success.
     */
    const triggerAcceptance = async (
      input: { workOrderId: string; orderNo: string; priority: string },
      mode: 'auto' | 'manual',
      idempotencyKey?: string | null,
    ): Promise<{ accepted: boolean; eventKey: string }> => {
      const eventKey =
        mode === 'auto'
          ? `service:auto-accept:${input.workOrderId}`
          : `service:manual-accept:${input.workOrderId}:${idempotencyKey ?? 'once'}`;
      if (!container.has(workflowServiceToken)) return { accepted: false, eventKey };
      const runtime = container.resolve(workflowServiceToken);
      const receipt = await runtime.trigger(
        'work-order-acceptance',
        {
          workOrderId: input.workOrderId,
          orderNo: input.orderNo,
          priority: input.priority === 'urgent' ? 'urgent' : 'normal',
        },
        { eventKey },
      );
      return { accepted: receipt.status === 'accepted', eventKey };
    };

    /**
     * Records that an acceptance could not be fulfilled automatically, so the
     * failure is visible in the order's own log and the order stays 待受理 for a
     * supervisor to accept by hand. Best effort: a bookkeeping failure must not
     * hide the order that was created.
     */
    const recordAcceptanceFailure = async (
      workOrderId: string,
      reason: string,
    ): Promise<void> => {
      if (!container.has(databaseManagerToken)) return;
      const database = container.resolve(databaseManagerToken);
      try {
        await database.repository<Record<string, unknown>>(COLLECTIONS.workOrderExecutions).createOne({
          values: {
            id: `exec-workflow-${workOrderId}`,
            workOrderId,
            action: 'accept',
            fromStatus: 'pending_acceptance',
            toStatus: 'pending_acceptance',
            operatorId: null,
            idempotencyKey: null,
            result: 'failed',
            failureReason: reason,
            detail: 'workflow',
            attempt: 1,
            createdAt: new Date().toISOString(),
          },
        });
      } catch {
        // The order and its status remain the source of truth.
      }
    };

    /**
     * The workflow engine runs a triggered revision on its job queue, so a node
     * that fails does so after `trigger()` has already answered `accepted`.
     * This waits for the run the trigger started and, when that run ends in
     * failure, records the same order-level failure the synchronous path
     * records, so the order's own timeline explains why it stayed unaccepted.
     * It is bounded: a run that has not finished within the window leaves the
     * order alone, because the workflow's own run record still holds the error.
     */
    const recordAcceptanceFailureFromRun = async (
      workOrderId: string,
      eventKey: string,
    ): Promise<void> => {
      if (!container.has(databaseManagerToken)) return;
      const database = container.resolve(databaseManagerToken);
      const runs = database.repository<{
        id: string;
        status: number | null;
        eventKey: string | null;
      }>('workflowRuns');
      const nodeRuns = database.repository<{
        id: string;
        workflowRunId: string;
        error: string | null;
      }>('workflowNodeRuns');
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const run = await runs.findOne({
          filter: { eventKey },
        });
        const raw = run?.status as unknown;
        const status =
          raw === null || raw === undefined || raw === ''
            ? null
            : Number(raw);
        if (status !== null && Number.isFinite(status)) {
          // `1` is RESOLVED, the branch ran and the order moved. `null` is
          // still queued and `0` is STARTED, so both keep waiting: treating
          // every non-negative status as success returned on STARTED and lost
          // the failure that arrived a few milliseconds later. A negative
          // status is FAILED, ERROR or ABORTED, the only terminal failures.
          if (status === 1) return;
          if (status < 0) {
            const failedNodes = await nodeRuns.findMany({
              filter: { workflowRunId: run?.id },
              sort: (s) => s.field('id').desc(),
              limit: 1,
            });
            const error =
              typeof failedNodes[0]?.error === 'string' &&
              failedNodes[0].error
                ? failedNodes[0].error
                : 'AUTO_ACCEPT_WORKFLOW_FAILED';
            const reason =
              error.split(':')[0].trim() || 'AUTO_ACCEPT_WORKFLOW_FAILED';
            await recordAcceptanceFailure(workOrderId, reason);
            return;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };

    // ------------------------------------------------------------------ customers
    router.get(
      '/customers',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'List customers',
        operationId: 'listCustomers',
        responses: {
          200: listResponse(CustomerViewSchema, PageMetaSchema),
          ...errors,
        },
      }),
      apiValidator('query', ListQuery),
      async (context) => {
        const values = await serviceContext(context, [customerView]);
        return context.json(
          await service.listCustomers(context.req.valid('query'), values),
        );
      },
    );

    router.post(
      '/customers',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Create a customer',
        operationId: 'createCustomer',
        responses: {
          200: dataResponse(CustomerViewSchema, 'The created customer.'),
          400: apiErrorResponse(400, 'The customer code is already in use.'),
          ...errors,
        },
      }),
      apiValidator('json', CreateCustomerInput),
      async (context) => {
        const values = await serviceContext(context, [customerMaintain]);
        try {
          return context.json({
            data: await service.createCustomer(
              context.req.valid('json'),
              values,
            ),
          });
        } catch (error) {
          throw toApiError(error, context);
        }
      },
    );

    router.get(
      '/customers/:id',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Read one customer',
        operationId: 'getCustomer',
        responses: {
          200: dataResponse(CustomerViewSchema),
          404: apiErrorResponse(404),
          ...errors,
        },
      }),
      apiValidator('param', IdParam),
      async (context) => {
        const values = await serviceContext(context, [customerView]);
        const customer = await service.getCustomer(
          context.req.valid('param').id,
          values,
        );
        if (!customer) {
          throw notFound('CUSTOMER_NOT_FOUND', 'Customer not found.');
        }
        return context.json({ data: customer });
      },
    );

    router.patch(
      '/customers/:id',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Update a customer',
        operationId: 'updateCustomer',
        responses: {
          200: dataResponse(CustomerViewSchema),
          404: apiErrorResponse(404),
          ...errors,
        },
      }),
      apiValidator('param', IdParam),
      apiValidator('json', UpdateCustomerInput),
      async (context) => {
        const values = await serviceContext(context, [customerMaintain]);
        try {
          return context.json({
            data: await service.updateCustomer(
              context.req.valid('param').id,
              context.req.valid('json'),
              values,
            ),
          });
        } catch (error) {
          throw toApiError(error, context);
        }
      },
    );

    // -------------------------------------------------------------------- devices
    router.get(
      '/devices',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'List devices',
        operationId: 'listDevices',
        responses: {
          200: listResponse(DeviceViewSchema, PageMetaSchema),
          ...errors,
        },
      }),
      apiValidator('query', ListQuery),
      async (context) => {
        const values = await serviceContext(context, [deviceView]);
        return context.json(
          await service.listDevices(context.req.valid('query'), values),
        );
      },
    );

    router.post(
      '/devices',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Create a device',
        operationId: 'createDevice',
        responses: {
          200: dataResponse(DeviceViewSchema, 'The created device.'),
          400: apiErrorResponse(400, 'The device code is already in use.'),
          ...errors,
        },
      }),
      apiValidator('json', CreateDeviceInput),
      async (context) => {
        const values = await serviceContext(context, [deviceMaintain]);
        try {
          return context.json({
            data: await service.createDevice(context.req.valid('json'), values),
          });
        } catch (error) {
          throw toApiError(error, context);
        }
      },
    );

    router.get(
      '/devices/:id',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Read one device',
        operationId: 'getDevice',
        responses: {
          200: dataResponse(DeviceViewSchema),
          404: apiErrorResponse(404),
          ...errors,
        },
      }),
      apiValidator('param', IdParam),
      async (context) => {
        const values = await serviceContext(context, [deviceView]);
        const device = await service.getDevice(
          context.req.valid('param').id,
          values,
        );
        if (!device) throw notFound('DEVICE_NOT_FOUND', 'Device not found.');
        return context.json({ data: device });
      },
    );

    router.patch(
      '/devices/:id',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Update a device',
        operationId: 'updateDevice',
        responses: {
          200: dataResponse(DeviceViewSchema),
          404: apiErrorResponse(404),
          ...errors,
        },
      }),
      apiValidator('param', IdParam),
      apiValidator('json', UpdateDeviceInput),
      async (context) => {
        const values = await serviceContext(context, [deviceMaintain]);
        try {
          return context.json({
            data: await service.updateDevice(
              context.req.valid('param').id,
              context.req.valid('json'),
              values,
            ),
          });
        } catch (error) {
          throw toApiError(error, context);
        }
      },
    );

    // ---------------------------------------------------------------- work orders
    router.get(
      '/workOrders',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'List work orders',
        operationId: 'listWorkOrders',
        responses: {
          200: listResponse(WorkOrderViewSchema, PageMetaSchema),
          ...errors,
        },
      }),
      apiValidator('query', WorkOrderListQuery),
      async (context) => {
        const values = await serviceContext(context, [workOrderView]);
        return context.json(
          await service.listWorkOrders(context.req.valid('query'), values),
        );
      },
    );

    router.post(
      '/workOrders',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Create a work order',
        operationId: 'createWorkOrder',
        responses: {
          200: dataResponse(WorkOrderViewSchema, 'The created work order.'),
          ...errors,
        },
      }),
      apiValidator('json', CreateWorkOrderInput),
      async (context) => {
        const values = await serviceContext(context, [workOrderCreate]);
        try {
          const created = await service.createWorkOrder(
            context.req.valid('json'),
            values,
          );
          // An urgent order is accepted by the workflow, which assigns it and
          // announces the acceptance itself. A normal order waits for a
          // supervisor, so nothing is triggered here.
          if (created.priority === 'urgent') {
            const attempt = await triggerAcceptance(
              {
                workOrderId: created.id,
                orderNo: created.orderNo,
                priority: created.priority,
              },
              'auto',
            );
            if (attempt.accepted) {
              await recordAcceptanceFailureFromRun(created.id, attempt.eventKey);
            } else {
              await recordAcceptanceFailure(
                created.id,
                'AUTO_ACCEPT_WORKFLOW_UNAVAILABLE',
              );
            }
          }
          return context.json({ data: created });
        } catch (error) {
          throw toApiError(error, context);
        }
      },
    );

    router.get(
      '/workOrders/shareTargets',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'List the users a work order can be shared with',
        operationId: 'listWorkOrderShareTargets',
        responses: {
          200: listResponse(ShareTargetViewSchema),
          ...errors,
        },
      }),
      apiValidator('query', ListQuery),
      async (context) => {
        await serviceContext(context, [workOrderShare]);
        return context.json({
          data: await service.listShareTargets(
            context.req.valid('query').search,
          ),
        });
      },
    );

    router.get(
      '/workOrders/:id',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Read one work order with its log, shares and attachments',
        operationId: 'getWorkOrder',
        responses: {
          200: dataResponse(WorkOrderDetailViewSchema),
          404: apiErrorResponse(404),
          ...errors,
        },
      }),
      apiValidator('param', IdParam),
      async (context) => {
        const permitted = await permittedActions(context);
        const values: ServiceContext = {
          ...(await serviceContext(context, [workOrderView])),
          permittedActions: permitted,
        };
        const id = context.req.valid('param').id;
        const detail = await service.getWorkOrderDetail(id, values);
        if (!detail)
          throw notFound('WORK_ORDER_NOT_FOUND', 'Work order not found.');
        // What the caller may do to *this* order, not to any order: a temporary
        // share recipient sees the order but no buttons that would be denied.
        const allowed = await recordScopedActions(
          context,
          container.resolve(databaseManagerToken),
          id,
          detail.allowedActions,
        );
        return context.json({
          data: { ...detail, allowedActions: allowed },
        });
      },
    );

    router.post(
      '/workOrders/:id/actions/:action',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Apply one lifecycle action to a work order',
        operationId: 'transitionWorkOrder',
        responses: {
          200: dataResponse(WorkOrderDetailViewSchema),
          400: apiErrorResponse(
            400,
            'The action is not allowed from the order’s current status, or its required field is missing.',
          ),
          404: apiErrorResponse(404),
          ...errors,
        },
      }),
      apiValidator('param', WorkOrderActionParam),
      apiValidator('json', TransitionInput),
      async (context) => {
        const { id, action } = context.req.valid('param');
        const permission = permissionActionFor(action);
        const values = await serviceContext(context, [
          workOrderView,
          read(SERVICE_RESOURCES.workOrders, permission),
        ]);
        // The route's own gate next to the policy: an action whose grant the
        // caller does not hold must not reach the state machine at all.
        const decision = await context.var.authz.authorize({
          resource: { type: 'composite', id: SERVICE_RESOURCES.workOrders },
          action: permission,
        });
        if (decision.effect === 'deny') {
          throw new AuthorizationDeniedError(decision);
        }
        try {
          const detail = await service.transitionWorkOrder(
            id,
            action,
            context.req.valid('json'),
            values,
          );
          await announceTransition(
            context,
            notify,
            detail.order,
            action,
            context.req.valid('json').idempotencyKey,
          );
          // The acceptance the workflow explains: a manual accept is audited
          // here, and the workflow's branch records whether it had to do the
          // assignment itself (urgent) or found it already done by a supervisor.
          if (action === 'accept') {
            const attempt = await triggerAcceptance(
              {
                workOrderId: detail.order.id,
                orderNo: detail.order.orderNo,
                priority: detail.order.priority,
              },
              'manual',
              context.req.valid('json').idempotencyKey,
            );
            if (attempt.accepted) {
              await recordAcceptanceFailureFromRun(
                detail.order.id,
                attempt.eventKey,
              );
            }
          }
          const allowed = await recordScopedActions(
            context,
            container.resolve(databaseManagerToken),
            detail.order.id,
            detail.allowedActions,
          );
          return context.json({
            data: {
              ...detail,
              allowedActions: allowed,
            },
          });
        } catch (error) {
          throw toApiError(error, context);
        }
      },
    );

    router.post(
      '/workOrders/:id/shares',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Share a work order with one user',
        operationId: 'shareWorkOrder',
        responses: {
          200: dataResponse(WorkOrderShareViewSchema),
          404: apiErrorResponse(404),
          ...errors,
        },
      }),
      apiValidator('param', IdParam),
      apiValidator('json', ShareInput),
      async (context) => {
        const values = await serviceContext(context, [workOrderShare]);
        try {
          return context.json({
            data: await service.createShare(
              context.req.valid('param').id,
              context.req.valid('json'),
              values,
            ),
          });
        } catch (error) {
          throw toApiError(error, context);
        }
      },
    );

    router.delete(
      '/workOrders/:id/shares/:shareId',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Revoke a work-order share',
        operationId: 'revokeWorkOrderShare',
        responses: {
          204: emptyResponse(),
          404: apiErrorResponse(404),
          ...errors,
        },
      }),
      apiValidator('param', IdParam.extend({ shareId: z.string().min(1) })),
      async (context) => {
        const values = await serviceContext(context, [workOrderShare]);
        try {
          await service.revokeShare(
            context.req.valid('param').id,
            context.req.valid('param').shareId,
            values,
          );
          return context.body(null, 204);
        } catch (error) {
          throw toApiError(error, context);
        }
      },
    );

    router.post(
      '/workOrders/:id/attachments',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Attach a file to a work order',
        operationId: 'addWorkOrderAttachment',
        description:
          'Stores one uploaded file and links it to the work order. The body is `multipart/form-data` with the file in `file` and an optional `category` of `photo` or `report`.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary',
                    description:
                      'The file content. Its name and type become the stored record.',
                  },
                  category: {
                    type: 'string',
                    enum: ['photo', 'report'],
                    description: 'What the file is for; `photo` when omitted.',
                  },
                },
              },
            },
          },
        },
        responses: {
          201: dataResponse(AttachmentViewSchema, 'The stored attachment.'),
          400: apiErrorResponse(
            400,
            'The body is not multipart, or carries no `file` field (`INVALID_FILE`).',
          ),
          404: apiErrorResponse(404),
          413: apiErrorResponse(
            413,
            `The file is larger than ${ATTACHMENT_MAX_BYTES} bytes (`,
          ),
          ...errors,
        },
      }),
      apiValidator('param', IdParam),
      async (context) => {
        const values = await serviceContext(context, [
          workOrderView,
          workOrderAttach,
        ]);
        let body: Awaited<ReturnType<typeof context.req.parseBody>>;
        try {
          body = await context.req.parseBody();
        } catch {
          throw invalidFile('The body is not valid multipart/form-data.');
        }
        const file = body.file;
        if (!(file instanceof File)) {
          throw invalidFile('Exactly one `file` field is required.');
        }
        if (file.size > ATTACHMENT_MAX_BYTES) {
          throw new ApiError({
            status: 'INVALID_ARGUMENT',
            reason: 'FILE_TOO_LARGE',
            domain: 'service',
            message: `The file exceeds ${ATTACHMENT_MAX_BYTES} bytes.`,
            httpStatus: 413,
          });
        }
        const category = parseApiInput(AttachmentForm, {
          category: body.category,
        }).category;
        try {
          return context.json(
            {
              data: await service.uploadAttachment(
                context.req.valid('param').id,
                file,
                category,
                values,
              ),
            },
            201,
          );
        } catch (error) {
          throw toApiError(error, context);
        }
      },
    );

    router.delete(
      '/workOrders/:id/attachments/:attachmentId',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Remove an attachment from a work order',
        operationId: 'removeWorkOrderAttachment',
        responses: {
          204: emptyResponse(),
          404: apiErrorResponse(404),
          ...errors,
        },
      }),
      apiValidator(
        'param',
        IdParam.extend({ attachmentId: z.string().min(1) }),
      ),
      async (context) => {
        const values = await serviceContext(context, [
          workOrderView,
          workOrderAttach,
        ]);
        try {
          await service.removeAttachment(
            context.req.valid('param').id,
            context.req.valid('param').attachmentId,
            values,
          );
          return context.body(null, 204);
        } catch (error) {
          throw toApiError(error, context);
        }
      },
    );

    /**
     * The bytes of one attachment, behind the order's own read permission.
     *
     * The File plugin's public content route is not registered for this
     * application: it serves anyone holding the file UUID. This route reads the
     * order through the caller's work-order policy first, so a link copied to
     * someone outside the order answers `403` rather than the file. The bytes
     * come from the private disk and are streamed through, never redirected.
     */
    router.get(
      '/workOrders/:id/attachments/:attachmentId/content',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Download the bytes of a work order attachment',
        operationId: 'getWorkOrderAttachmentContent',
        description:
          'Streams the stored file for a caller who can read the order. The URL is an authorization check, not an unguessable secret: anyone else is refused.',
        responses: {
          200: {
            description: 'The stored file bytes.',
            content: {
              'application/octet-stream': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
          404: apiErrorResponse(404),
          ...errors,
        },
      }),
      apiValidator(
        'param',
        IdParam.extend({ attachmentId: z.string().min(1) }),
      ),
      async (context) => {
        const values = await serviceContext(context, [workOrderView]);
        try {
          const storage = await service.getAttachmentStorage(
            context.req.valid('param').id,
            context.req.valid('param').attachmentId,
            values,
          );
          const drive = container.resolve(driveManagerToken);
          const stream = await drive.use(storage.disk).getStream(storage.key);
          context.header('content-type', storage.mimeType);
          context.header('content-length', String(storage.size));
          context.header(
            'content-disposition',
            `inline; filename*=UTF-8''${encodeURIComponent(storage.filename)}`,
          );
          return context.body(
            Readable.toWeb(stream) as unknown as ReadableStream,
          );
        } catch (error) {
          throw toApiError(error, context);
        }
      },
    );

    // --------------------------------------------------------------- repair notes
    router.get(
      '/repairNotes',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'List repair notes',
        operationId: 'listRepairNotes',
        responses: {
          200: listResponse(RepairNoteViewSchema, PageMetaSchema),
          ...errors,
        },
      }),
      apiValidator('query', ListQuery),
      async (context) => {
        const values = await serviceContext(context, [repairNoteView]);
        return context.json(
          await service.listRepairNotes(context.req.valid('query'), values),
        );
      },
    );

    router.post(
      '/repairNotes',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Write a repair note',
        operationId: 'createRepairNote',
        responses: {
          200: dataResponse(RepairNoteViewSchema),
          ...errors,
        },
      }),
      apiValidator('json', CreateRepairNoteInput),
      async (context) => {
        const values = await serviceContext(context, [repairNotePublish]);
        try {
          return context.json({
            data: await service.createRepairNote(
              context.req.valid('json'),
              values,
            ),
          });
        } catch (error) {
          throw toApiError(error, context);
        }
      },
    );

    router.post(
      '/repairNotes/:id/publish',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Publish a repair note into the knowledge base',
        operationId: 'publishRepairNote',
        responses: {
          200: dataResponse(RepairNoteViewSchema),
          404: apiErrorResponse(404),
          ...errors,
        },
      }),
      apiValidator('param', IdParam),
      async (context) => {
        const values = await serviceContext(context, [repairNotePublish]);
        try {
          return context.json({
            data: await service.publishRepairNote(
              context.req.valid('param').id,
              values,
            ),
          });
        } catch (error) {
          throw toApiError(error, context);
        }
      },
    );

    // ------------------------------------------------------------------- manuals
    router.get(
      '/manuals',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'List device manuals',
        operationId: 'listManuals',
        responses: {
          200: listResponse(ManualViewSchema, PageMetaSchema),
          ...errors,
        },
      }),
      apiValidator('query', ListQuery),
      async (context) => {
        const values = await serviceContext(context, [manualView]);
        return context.json(
          await service.listManuals(context.req.valid('query'), values),
        );
      },
    );

    router.post(
      '/manuals',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Add a device manual',
        operationId: 'createManual',
        responses: {
          200: dataResponse(ManualViewSchema),
          ...errors,
        },
      }),
      apiValidator('json', CreateManualInput),
      async (context) => {
        const values = await serviceContext(context, [manualMaintain]);
        try {
          return context.json({
            data: await service.createManual(context.req.valid('json'), values),
          });
        } catch (error) {
          throw toApiError(error, context);
        }
      },
    );

    router.post(
      '/manuals/:id/publish',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Publish a device manual to the knowledge base',
        operationId: 'publishManual',
        responses: {
          200: dataResponse(ManualViewSchema),
          404: apiErrorResponse(404),
          ...errors,
        },
      }),
      apiValidator('param', IdParam),
      async (context) => {
        const values = await serviceContext(context, [manualMaintain]);
        try {
          return context.json({
            data: await service.publishManual(
              context.req.valid('param').id,
              values,
            ),
          });
        } catch (error) {
          throw toApiError(error, context);
        }
      },
    );

    // --------------------------------------------------------------- inspections
    router.get(
      '/inspectionTasks',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'List inspection tasks',
        operationId: 'listInspectionTasks',
        responses: {
          200: listResponse(InspectionTaskViewSchema, PageMetaSchema),
          ...errors,
        },
      }),
      apiValidator('query', ListQuery),
      async (context) => {
        const values = await serviceContext(context, [inspectionView]);
        return context.json(
          await service.listInspectionTasks(context.req.valid('query'), values),
        );
      },
    );

    router.post(
      '/inspectionTasks/:id/complete',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Complete an inspection task',
        operationId: 'completeInspection',
        responses: {
          200: dataResponse(InspectionTaskViewSchema),
          404: apiErrorResponse(404),
          ...errors,
        },
      }),
      apiValidator('param', IdParam),
      apiValidator('json', CompleteInspectionInput),
      async (context) => {
        const values = await serviceContext(context, [inspectionComplete]);
        const id = context.req.valid('param').id;
        if (
          !(await service.ensureVisible(
            COLLECTIONS.inspectionTasks,
            id,
            values,
          ))
        ) {
          throw notFound('INSPECTION_NOT_FOUND', 'Inspection task not found.');
        }
        try {
          return context.json({
            data: await service.completeInspection(
              id,
              context.req.valid('json'),
              values,
            ),
          });
        } catch (error) {
          throw toApiError(error, context);
        }
      },
    );

    // ------------------------------------------------------- scheduled operations
    router.get(
      '/serviceTasks',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'List the scheduled service tasks and their last run',
        operationId: 'listServiceTasks',
        responses: {
          200: dataResponse(TaskListViewSchema),
          ...errors,
        },
      }),
      async (context) => {
        await serviceContext(context, [workOrderView]);
        return context.json({ data: await service.listTaskDefinitions() });
      },
    );

    router.post(
      '/serviceTasks/:key/run',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Run one scheduled service task now',
        operationId: 'runServiceTask',
        responses: {
          200: dataResponse(TaskRunResultViewSchema),
          404: apiErrorResponse(404),
          ...errors,
        },
      }),
      apiValidator('param', TaskKeyParam),
      apiValidator('json', RunTaskInput),
      async (context) => {
        await serviceContext(context, [systemRunTask]);
        try {
          return context.json({
            data: await service.runTask(
              context.req.valid('param').key,
              context.req.valid('json').date,
            ),
          });
        } catch (error) {
          throw toApiError(error, context);
        }
      },
    );

    router.get(
      '/scheduledRuns',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'List the ledger of scheduled task runs',
        operationId: 'listScheduledRuns',
        responses: {
          200: listResponse(ScheduledRunViewSchema, PageMetaSchema),
          ...errors,
        },
      }),
      apiValidator('query', ScheduledRunQuery),
      async (context) => {
        const values = await serviceContext(context, [workOrderView]);
        // `taskKey` narrows to one task; the service's list query carries it as
        // its status filter, which no other value uses on this collection.
        const { taskKey, ...query } = context.req.valid('query');
        return context.json(
          await service.listScheduledRuns(
            { ...query, status: taskKey },
            values,
          ),
        );
      },
    );

    router.get(
      '/overdueReminders',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'List the overdue reminders that have been sent',
        operationId: 'listOverdueReminders',
        responses: {
          200: listResponse(OverdueReminderViewSchema, PageMetaSchema),
          ...errors,
        },
      }),
      apiValidator('query', ListQuery),
      async (context) => {
        const values = await serviceContext(context, [workOrderView]);
        return context.json(
          await service.listOverdueReminders(
            context.req.valid('query'),
            values,
          ),
        );
      },
    );

    // --------------------------------------------------------- service groups
    router.get(
      '/serviceGroups',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'List the dispatch groups',
        operationId: 'listServiceGroups',
        responses: {
          200: listResponse(ServiceGroupViewSchema, PageMetaSchema),
          ...errors,
        },
      }),
      apiValidator('query', PageQuery),
      async (context) => {
        const values = await serviceContext(context, [customerView]);
        return context.json(
          await service.listServiceGroups(context.req.valid('query'), values),
        );
      },
    );

    // ------------------------------------------------------------------ overview
    router.get(
      '/overview',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'The service desk dashboard',
        operationId: 'getServiceOverview',
        responses: {
          200: dataResponse(OverviewViewSchema),
          ...errors,
        },
      }),
      apiValidator('query', PageQuery),
      async (context) => {
        const values = await serviceContext(context, [
          reportView,
          workOrderView,
          deviceView,
          customerView,
          inspectionView,
          repairNoteView,
        ]);
        const { pageSize } = context.req.valid('query');
        return context.json({
          data: await service.overview({ recentLimit: pageSize }, values),
        });
      },
    );

    // ------------------------------------------------------- device platform (API)
    router.post(
      '/devicePlatform/tickets',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Report a device fault from the device platform',
        operationId: 'submitDevicePlatformTicket',
        responses: {
          200: dataResponse(
            ExternalTicketAcceptedViewSchema,
            'The submission was already accepted; nothing was created.',
          ),
          201: dataResponse(
            ExternalTicketAcceptedViewSchema,
            'The submission created a work order.',
          ),
          ...errors,
        },
      }),
      apiValidator('json', ExternalTicketInput),
      async (context) => {
        await serviceContext(context, [devicePlatformSubmit]);
        try {
          const result = await service.submitExternalTicket(
            context.req.valid('json'),
          );
          // An urgent ticket the desk created is accepted the same way a manual
          // urgent order is: by the workflow, on a stable per-order event key.
          if (result.created && result.priority === 'urgent') {
            const attempt = await triggerAcceptance(
              {
                workOrderId: result.workOrderId,
                orderNo: result.orderNo,
                priority: result.priority,
              },
              'auto',
            );
            if (attempt.accepted) {
              await recordAcceptanceFailureFromRun(
                result.workOrderId,
                attempt.eventKey,
              );
            } else {
              await recordAcceptanceFailure(
                result.workOrderId,
                'AUTO_ACCEPT_WORKFLOW_UNAVAILABLE',
              );
            }
          }
          return context.json({ data: result }, result.created ? 201 : 200);
        } catch (error) {
          throw toApiError(error, context);
        }
      },
    );

    router.get(
      '/devicePlatform/tickets/:externalEventNo',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Read back one device-platform submission',
        operationId: 'getDevicePlatformTicket',
        responses: {
          200: dataResponse(ExternalTicketViewSchema),
          404: apiErrorResponse(404),
          ...errors,
        },
      }),
      apiValidator('param', ExternalTicketParams),
      async (context) => {
        await serviceContext(context, [devicePlatformRead]);
        const ticket = await service.getExternalTicket(
          context.req.valid('param').externalEventNo,
        );
        if (!ticket) throw notFound('TICKET_NOT_FOUND', 'Ticket not found.');
        return context.json({ data: ticket });
      },
    );

    // ----------------------------------------------------------------- assistant
    router.get(
      '/assistant',
      describeRoute({
        ...SERVICE_TAGS,
        summary: 'Whether the work-order assistant can answer',
        operationId: 'getAssistantStatus',
        responses: {
          200: dataResponse(AssistantStatusViewSchema),
          ...errors,
        },
      }),
      async (context) => {
        await serviceContext(context, [workOrderView]);
        return context.json({ data: await service.assistantStatus() });
      },
    );

    return router as unknown as Hono;
  },
);

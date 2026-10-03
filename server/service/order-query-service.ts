import type { DatabaseManager, FilterNode } from '@nocobase/db';
import type { AuthorizationContext } from '@nocobase/authorization/core';

import {
  hasCapability,
  resolvePolicy,
  scopedRepository,
} from './authorization-helper.js';
import type { ServiceAttachmentService } from './attachment-service.js';
import { rowsOf } from './values.js';

export interface OrderListFilter {
  search?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  page?: number;
  pageSize?: number;
}

/** Which order actions the caller may take at all, resolved once per request. */
interface OrderCapabilities {
  view: boolean;
  viewSummary: boolean;
  create: boolean;
  process: boolean;
  supervise: boolean;
  attach: boolean;
}

export interface OrderView {
  id: number;
  orderNo: string;
  title: string;
  problemDescription?: string | null;
  status: string;
  priority: string;
  source: string;
  confidential: boolean;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: {
    id: string | null;
    name: string | null;
    profileId: number | null;
  };
  customer: {
    id: number;
    name: string;
    contactName: string | null;
    contactPhone: string | null;
  } | null;
  device: {
    id: number;
    deviceNo: string;
    name: string;
    status: string;
    model: string | null;
    location: string | null;
    nextInspectionDate: string | null;
  } | null;
  acceptedAt?: string | null;
  acceptanceNote?: string | null;
  startedAt?: string | null;
  submittedAt?: string | null;
  closedAt?: string | null;
  resolution?: string | null;
  returnReason?: string | null;
  returnCount?: number;
  attachmentCount?: number;
  can: {
    view: boolean;
    viewSummary: boolean;
    process: boolean;
    supervise: boolean;
    attach: boolean;
  };
}

interface RawOrder {
  id: number;
  orderNo: string;
  title: string;
  problemDescription: string | null;
  status: string;
  priority: string;
  source: string;
  confidential: boolean | number;
  deadline: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  assigneeId: string | null;
  assigneeProfileId: number | null;
  customerId: number;
  deviceId: number;
  acceptedAt: Date | string | null;
  acceptanceNote: string | null;
  startedAt: Date | string | null;
  submittedAt: Date | string | null;
  closedAt: Date | string | null;
  resolution: string | null;
  returnReason: string | null;
  returnCount: number | null;
}

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

/**
 * The list UI expresses "no restriction" as the literal `all`; an empty string
 * can arrive the same way. Neither is a collection enum member, so filtering
 * on it would make the database reject the query.
 */
function normalizeFilterValue(value: string | undefined): string | undefined {
  if (!value || value === 'all') {
    return undefined;
  }
  return value;
}

/**
 * Reads service orders under the caller's own row policy, then attaches the
 * basic customer and device information the workflow needs. The enrichment
 * runs only after the order itself was visible, so it never widens access.
 */
export class ServiceOrderQueryService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly attachments: ServiceAttachmentService,
  ) {}

  private async resolveViewPolicy(context: AuthorizationContext) {
    const full = await resolvePolicy(
      context,
      'service.orders',
      'view',
      'serviceOrders',
    );
    if (full.effect !== 'deny') {
      return { action: 'view' as const, resolved: full };
    }
    const summary = await resolvePolicy(
      context,
      'service.orders',
      'viewSummary',
      'serviceOrders',
    );
    return { action: 'viewSummary' as const, resolved: summary };
  }

  async list(
    context: AuthorizationContext,
    filter: OrderListFilter,
  ): Promise<OrderView[]> {
    const { action, resolved } = await this.resolveViewPolicy(context);
    if (resolved.effect === 'deny') {
      return [];
    }
    const capabilities = await this.resolveCapabilities(context);
    const repository = scopedRepository(
      this.database,
      'serviceOrders',
      resolved,
    );
    const conditions: FilterNode[] = [];
    const status = normalizeFilterValue(filter.status);
    const priority = normalizeFilterValue(filter.priority);
    const assigneeId = normalizeFilterValue(filter.assigneeId);
    if (status) {
      conditions.push({
        kind: 'condition',
        path: ['status'],
        operator: '$eq',
        value: status,
      });
    }
    if (priority) {
      conditions.push({
        kind: 'condition',
        path: ['priority'],
        operator: '$eq',
        value: priority,
      });
    }
    if (assigneeId) {
      conditions.push({
        kind: 'condition',
        path: ['assigneeId'],
        operator: '$eq',
        value: assigneeId,
      });
    }
    if (filter.search) {
      conditions.push({
        kind: 'group',
        logic: 'or',
        items: [
          {
            kind: 'condition',
            path: ['title'],
            operator: '$includes',
            value: filter.search,
            mode: 'insensitive',
          },
          {
            kind: 'condition',
            path: ['orderNo'],
            operator: '$includes',
            value: filter.search,
          },
        ],
      });
    }
    const rows = (await repository.findMany({
      limit: filter.pageSize ?? 100,
      ...(conditions.length > 0
        ? {
            filter: {
              kind: 'filter',
              version: 1,
              collection: 'serviceOrders',
              root: { kind: 'group', logic: 'and', items: conditions },
            },
          }
        : {}),
      sort: {
        kind: 'sort',
        version: 1,
        collection: 'serviceOrders',
        items: [{ kind: 'field', path: ['createdAt'], direction: 'desc' }],
      },
    })) as unknown as RawOrder[];
    const views = await this.enrichOrders(context, rows, action, capabilities);
    return views;
  }

  async detail(
    context: AuthorizationContext,
    orderId: number,
  ): Promise<OrderView | undefined> {
    const { action, resolved } = await this.resolveViewPolicy(context);
    if (resolved.effect === 'deny') {
      return undefined;
    }
    const repository = scopedRepository(
      this.database,
      'serviceOrders',
      resolved,
    );
    const row = (await repository.findOne({
      filter: (builder) => builder.number('id').eq(orderId),
    })) as unknown as RawOrder | undefined;
    if (!row) {
      return undefined;
    }
    const [view] = await this.enrichOrders(
      context,
      [row],
      action,
      await this.resolveCapabilities(context),
    );
    return view;
  }

  /**
   * Resolves every order action once for the request. Row scope is not applied
   * here: a capability says the caller may do it to *some* order, and the row
   * itself still has to pass its own scope check before the action runs.
   */
  private async resolveCapabilities(
    context: AuthorizationContext,
  ): Promise<OrderCapabilities> {
    const permit = async (action: string): Promise<boolean> =>
      (await resolvePolicy(context, 'service.orders', action, 'serviceOrders'))
        .effect !== 'deny';
    return {
      view: await permit('view'),
      viewSummary: await permit('viewSummary'),
      create: await permit('create'),
      process: await permit('process'),
      supervise: await permit('supervise'),
      // `attach`'s grants name the attachment collections, not the order rows,
      // so the capability comes from the composite decision while the row scope
      // below follows the caller's `view` policy.
      attach: await hasCapability(context, 'service.orders', 'attach'),
    };
  }

  /**
   * Resolves, for each action, the subset of the given orders the caller may
   * actually act on. The capability flags only say an action is allowed on
   * *some* order; a shared order is readable without being processable, so the
   * detail view must not offer a write the row scope would then reject.
   */
  private async resolveRowScopes(
    context: AuthorizationContext,
    orderIds: readonly number[],
  ): Promise<Record<'process' | 'supervise' | 'attach', Set<number>>> {
    const scope = {
      process: new Set<number>(),
      supervise: new Set<number>(),
      attach: new Set<number>(),
    };
    if (orderIds.length === 0) {
      return scope;
    }
    for (const action of ['process', 'supervise', 'attach'] as const) {
      // The attachment capability grants no order rows: an order is attachable
      // exactly when the caller can see it, so its row scope is the `view`
      // policy. `attach` itself was already checked as a capability.
      const resolved = await resolvePolicy(
        context,
        'service.orders',
        action === 'attach' ? 'view' : action,
        'serviceOrders',
      );
      if (resolved.effect === 'deny') {
        continue;
      }
      if (resolved.effect === 'permit') {
        for (const id of orderIds) {
          scope[action].add(id);
        }
        continue;
      }
      const repository = scopedRepository(
        this.database,
        'serviceOrders',
        resolved,
      );
      const rows = (await repository.findMany({
        limit: orderIds.length,
        filter: (builder) =>
          orderIds.length === 1
            ? builder.number('id').eq(orderIds[0])
            : builder.or(orderIds.map((id) => builder.number('id').eq(id))),
      })) as unknown as { id: number }[];
      for (const row of rows) {
        scope[action].add(Number(row.id));
      }
    }
    return scope;
  }

  private async enrichOrders(
    context: AuthorizationContext,
    rows: readonly RawOrder[],
    action: 'view' | 'viewSummary',
    capabilities: OrderCapabilities,
  ): Promise<OrderView[]> {
    if (rows.length === 0) {
      return [];
    }
    const rowScope = await this.resolveRowScopes(
      context,
      rows.map((row) => Number(row.id)),
    );
    const query = this.database.query();
    const customerIds = [...new Set(rows.map((row) => row.customerId))];
    const deviceIds = [...new Set(rows.map((row) => row.deviceId))];
    const profileIds = [
      ...new Set(
        rows
          .map((row) => row.assigneeProfileId)
          .filter((id): id is number => id != null),
      ),
    ];
    const customers = rowsOf<CustomerLite>(
      await query
        .selectFrom('customers')
        .select(['id', 'name', 'contactName', 'contactPhone'])
        .where('id', 'in', customerIds)
        .execute(),
    );
    const devices = rowsOf<DeviceLite>(
      await query
        .selectFrom('devices')
        .select([
          'id',
          'deviceNo',
          'name',
          'status',
          'model',
          'location',
          'nextInspectionDate',
        ])
        .where('id', 'in', deviceIds)
        .execute(),
    );
    const profiles =
      profileIds.length > 0
        ? rowsOf<ProfileLite>(
            await query
              .selectFrom('engineerProfiles')
              .select(['id', 'displayName', 'username', 'userId'])
              .where('id', 'in', profileIds)
              .execute(),
          )
        : [];
    const customerById = new Map(
      customers.map((item) => [Number(item.id), item]),
    );
    const deviceById = new Map(devices.map((item) => [Number(item.id), item]));
    const profileById = new Map(
      profiles.map((item) => [Number(item.id), item]),
    );

    const views: OrderView[] = [];
    for (const row of rows) {
      const summary = action === 'viewSummary';
      const profile =
        row.assigneeProfileId == null
          ? undefined
          : profileById.get(row.assigneeProfileId);
      const view: OrderView = {
        id: Number(row.id),
        orderNo: String(row.orderNo),
        title: String(row.title),
        status: String(row.status),
        priority: String(row.priority),
        source: String(row.source),
        confidential: Boolean(row.confidential),
        deadline: iso(row.deadline),
        createdAt: iso(row.createdAt) as string,
        updatedAt: iso(row.updatedAt) as string,
        assignee: {
          id: row.assigneeId,
          name: profile ? (profile.displayName ?? profile.username) : null,
          profileId: row.assigneeProfileId,
        },
        customer: summary
          ? null
          : (customerById.get(Number(row.customerId)) ?? null),
        device: summary ? null : (deviceById.get(Number(row.deviceId)) ?? null),
        can: {
          view: !summary && capabilities.view,
          viewSummary: capabilities.viewSummary,
          process:
            !summary &&
            capabilities.process &&
            rowScope.process.has(Number(row.id)),
          supervise:
            !summary &&
            capabilities.supervise &&
            rowScope.supervise.has(Number(row.id)),
          attach:
            !summary &&
            capabilities.attach &&
            rowScope.attach.has(Number(row.id)),
        },
      };
      if (!summary) {
        view.problemDescription = row.problemDescription;
        view.acceptedAt = iso(row.acceptedAt);
        view.acceptanceNote = row.acceptanceNote;
        view.startedAt = iso(row.startedAt);
        view.submittedAt = iso(row.submittedAt);
        view.closedAt = iso(row.closedAt);
        view.resolution = row.resolution;
        view.returnReason = row.returnReason;
        view.returnCount = Number(row.returnCount ?? 0);
        view.attachmentCount = (
          await this.attachments.list(Number(row.id))
        ).length;
      }
      views.push(view);
    }
    return views;
  }
}

interface CustomerLite {
  id: number;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
}

interface DeviceLite {
  id: number;
  deviceNo: string;
  name: string;
  status: string;
  model: string | null;
  location: string | null;
  nextInspectionDate: string | null;
}

interface ProfileLite {
  id: number;
  displayName: string | null;
  username: string;
  userId: string | null;
}

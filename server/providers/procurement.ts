import type { AppAuthorization } from '@nocobase/app-plugin-authorization';
import type { DatabaseManager, Row } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { authorizationToken } from '@nocobase/app-plugin-authorization';

export const SYSTEM_ADMINISTRATOR = 'system-administrator';
export const PROCUREMENT_MANAGER = 'procurement-manager';
export const PROCUREMENT_BUYER = 'procurement-buyer';
export const PROCUREMENT_EMPLOYEE = 'procurement-employee';

export const SUPPLIER_CATEGORIES = [
  'material',
  'service',
  'engineering',
] as const;
export const SUPPLIER_STATUSES = ['active', 'disabled'] as const;
export const REQUEST_STATUSES = [
  'draft',
  'pending',
  'approved',
  'rejected',
] as const;
export const ORDER_STATUSES = ['ordered', 'partial', 'received'] as const;

export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number];
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface ProcurementActor {
  readonly id: string;
  readonly name: string;
}

export interface ProcurementCapabilities {
  readonly roles: readonly string[];
  readonly isAdministrator: boolean;
  readonly canApprove: boolean;
  readonly manageSuppliers: boolean;
  readonly manageOrders: boolean;
  readonly viewAllRequests: boolean;
}

export class ProcurementError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'ProcurementError';
    this.code = code;
    this.status = status;
  }
}

/** Maps the permission-set keys a principal holds onto business capabilities. */
export function describeCapabilities(
  roleKeys: Iterable<string>,
): ProcurementCapabilities {
  const roles = new Set(roleKeys);
  const isAdministrator = roles.has(SYSTEM_ADMINISTRATOR);
  const canApprove = isAdministrator || roles.has(PROCUREMENT_MANAGER);
  const manageSuppliers = isAdministrator || roles.has(PROCUREMENT_BUYER);
  const manageOrders = isAdministrator || roles.has(PROCUREMENT_BUYER);
  return {
    roles: [...roles],
    isAdministrator,
    canApprove,
    manageSuppliers,
    manageOrders,
    viewAllRequests: isAdministrator || canApprove || manageOrders,
  };
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface RequestItemInput {
  readonly materialName: string;
  readonly specification?: string | null;
  readonly quantity: number;
  readonly unitPrice: number;
}

export interface NormalizedRequestItem {
  readonly materialName: string;
  readonly specification: string | null;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly amount: number;
}

/**
 * Validates line items and computes each line amount and the request total.
 * Amounts are always derived here, never accepted from the client.
 */
export function normalizeRequestItems(
  items: readonly RequestItemInput[] | undefined,
): { items: NormalizedRequestItem[]; totalAmount: number } {
  if (!items || items.length === 0) {
    throw new ProcurementError(
      'ITEMS_REQUIRED',
      'At least one item is required.',
    );
  }
  const normalized = items.map((item) => {
    const materialName = String(item.materialName ?? '').trim();
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    if (!materialName) {
      throw new ProcurementError(
        'ITEM_NAME_REQUIRED',
        'Item name is required.',
      );
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ProcurementError(
        'ITEM_QUANTITY_INVALID',
        'Item quantity must be greater than zero.',
      );
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new ProcurementError(
        'ITEM_PRICE_INVALID',
        'Item unit price must not be negative.',
      );
    }
    return {
      materialName,
      specification:
        item.specification === undefined || item.specification === null
          ? null
          : String(item.specification).trim() || null,
      quantity,
      unitPrice,
      amount: roundMoney(quantity * unitPrice),
    };
  });
  const totalAmount = roundMoney(
    normalized.reduce((sum, item) => sum + item.amount, 0),
  );
  return { items: normalized, totalAmount };
}

/** The order status implied by a cumulative received quantity. */
export function orderStatusFor(
  totalQuantity: number,
  receivedQuantity: number,
): OrderStatus {
  if (receivedQuantity <= 0) return 'ordered';
  return receivedQuantity >= totalQuantity ? 'received' : 'partial';
}

/** Rejects a receipt that would push the cumulative amount past the order. */
export function assertReceivable(
  totalQuantity: number,
  receivedQuantity: number,
  quantity: number,
): void {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new ProcurementError(
      'RECEIPT_QUANTITY_INVALID',
      'Receipt quantity must be greater than zero.',
    );
  }
  const remaining = roundMoney(totalQuantity - receivedQuantity);
  if (roundMoney(quantity) > remaining) {
    throw new ProcurementError(
      'RECEIPT_EXCEEDS_ORDER',
      `Receipt quantity exceeds the remaining ${remaining}.`,
      409,
    );
  }
}

export interface ProcurementSupplier {
  readonly id: number;
  readonly name: string;
  readonly unifiedSocialCreditCode: string | null;
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly category: string;
  readonly status: string;
  readonly files: readonly ProcurementAttachment[];
  readonly createdAt: string;
}

export interface ProcurementAttachment {
  readonly id: number;
  readonly ownerType: string;
  readonly ownerId: string;
  readonly fileId: string;
  readonly filename: string | null;
  readonly contentUrl: string;
}

export interface ProcurementRequestItem {
  readonly id: number;
  readonly materialName: string;
  readonly specification: string | null;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly amount: number;
}

export interface ProcurementRequest {
  readonly id: number;
  readonly applicantId: string;
  readonly applicantName: string | null;
  readonly department: string | null;
  readonly description: string | null;
  readonly expectedDate: string | null;
  readonly status: RequestStatus;
  readonly rejectReason: string | null;
  readonly totalAmount: number;
  readonly submittedAt: string | null;
  readonly approvedAt: string | null;
  readonly items: readonly ProcurementRequestItem[];
  readonly files: readonly ProcurementAttachment[];
  readonly createdAt: string;
}

export interface ProcurementReceipt {
  readonly id: number;
  readonly orderId: number;
  readonly quantity: number;
  readonly receivedDate: string;
  readonly createdAt: string;
}

export interface ProcurementOrder {
  readonly id: number;
  readonly orderNumber: string;
  readonly requestId: number | null;
  readonly supplierId: number;
  readonly supplierName: string | null;
  readonly amount: number;
  readonly totalQuantity: number;
  readonly receivedQuantity: number;
  readonly orderDate: string;
  readonly status: OrderStatus;
  readonly receipts: readonly ProcurementReceipt[];
  readonly createdAt: string;
}

export interface ProcurementStatistics {
  readonly pendingApprovalCount: number;
  readonly bySupplier: readonly {
    supplierId: number;
    supplierName: string;
    total: number;
  }[];
  readonly byMonth: readonly { month: string; total: number }[];
}

export interface ProcurementService {
  capabilities(actor: ProcurementActor): Promise<ProcurementCapabilities>;
  listSuppliers(filter: {
    category?: string;
    search?: string;
  }): Promise<readonly ProcurementSupplier[]>;
  getSupplier(id: number): Promise<ProcurementSupplier>;
  createSupplier(
    input: SupplierInput,
    actor: ProcurementActor,
    capabilities: ProcurementCapabilities,
  ): Promise<ProcurementSupplier>;
  updateSupplier(
    id: number,
    input: SupplierInput,
    capabilities: ProcurementCapabilities,
  ): Promise<ProcurementSupplier>;
  listRequests(
    actor: ProcurementActor,
    capabilities: ProcurementCapabilities,
  ): Promise<readonly ProcurementRequest[]>;
  getRequest(
    id: number,
    actor: ProcurementActor,
    capabilities: ProcurementCapabilities,
  ): Promise<ProcurementRequest>;
  createRequest(
    input: RequestInput,
    actor: ProcurementActor,
  ): Promise<ProcurementRequest>;
  updateRequest(
    id: number,
    input: RequestInput,
    actor: ProcurementActor,
    capabilities: ProcurementCapabilities,
  ): Promise<ProcurementRequest>;
  submitRequest(
    id: number,
    actor: ProcurementActor,
    capabilities: ProcurementCapabilities,
  ): Promise<ProcurementRequest>;
  approveRequest(
    id: number,
    actor: ProcurementActor,
  ): Promise<ProcurementRequest>;
  rejectRequest(
    id: number,
    actor: ProcurementActor,
    reason: string,
  ): Promise<ProcurementRequest>;
  listOrders(): Promise<readonly ProcurementOrder[]>;
  getOrder(id: number): Promise<ProcurementOrder>;
  createOrderFromRequest(
    input: { requestId: number; supplierId: number; orderDate: string },
    actor: ProcurementActor,
  ): Promise<ProcurementOrder>;
  createReceipt(
    orderId: number,
    input: { quantity: number; receivedDate: string },
    actor: ProcurementActor,
  ): Promise<ProcurementOrder>;
  listAttachments(
    ownerType: string,
    ownerId: string,
  ): Promise<readonly ProcurementAttachment[]>;
  addAttachment(
    ownerType: string,
    ownerId: string,
    fileId: string,
  ): Promise<ProcurementAttachment>;
  removeAttachment(id: number): Promise<void>;
  getAttachment(id: number): Promise<ProcurementAttachment>;
  statistics(): Promise<ProcurementStatistics>;
}

export interface SupplierInput {
  readonly name: string;
  readonly unifiedSocialCreditCode?: string | null;
  readonly contactName?: string | null;
  readonly contactPhone?: string | null;
  readonly category: string;
  readonly status: string;
}

export interface RequestInput {
  readonly department?: string | null;
  readonly description?: string | null;
  readonly expectedDate?: string | null;
  readonly items: readonly RequestItemInput[];
}

export const procurementServiceToken: ServiceToken<ProcurementService> =
  createServiceToken<ProcurementService>('app/procurement-service');

export default class ProcurementProvider extends ServiceProvider<Application> {
  public readonly name = 'app/procurement-provider';

  public override register(): void {
    this.app.container.singleton(procurementServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      const authorization = this.app.container.resolve(authorizationToken);
      return createProcurementService(database, authorization);
    });
  }
}

export function createProcurementService(
  database: DatabaseManager,
  authorization: Pick<AppAuthorization, 'permissionSets'>,
): ProcurementService {
  const query = database.query();

  async function rolesFor(actor: ProcurementActor): Promise<string[]> {
    const assignments = await authorization.permissionSets.listAssignments();
    return assignments
      .filter(
        (assignment) =>
          (assignment.subject.type === 'user' &&
            assignment.subject.id === actor.id) ||
          (assignment.subject.type === 'authenticated' &&
            assignment.subject.id === '*'),
      )
      .map((assignment) => assignment.permissionSet);
  }

  return {
    async capabilities(actor) {
      return describeCapabilities(await rolesFor(actor));
    },

    async listSuppliers(filter) {
      let builder = query
        .selectFrom('procurementSuppliers')
        .selectAll()
        .orderBy('id', 'desc');
      if (filter.category) {
        builder = builder.where('category', '=', filter.category);
      }
      if (filter.search) {
        builder = builder.where((eb) =>
          eb.or([
            eb('name', 'like', `%${filter.search}%`),
            eb('contactName', 'like', `%${filter.search}%`),
          ]),
        );
      }
      const rows = await builder.execute();
      const suppliers = rows.map(mapSupplier);
      return Promise.all(
        suppliers.map(async (supplier) => ({
          ...supplier,
          files: await this.listAttachments('supplier', String(supplier.id)),
        })),
      );
    },

    async getSupplier(id) {
      const row = await query
        .selectFrom('procurementSuppliers')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) {
        throw new ProcurementError(
          'SUPPLIER_NOT_FOUND',
          'Supplier not found.',
          404,
        );
      }
      const supplier = mapSupplier(row);
      return {
        ...supplier,
        files: await this.listAttachments('supplier', String(supplier.id)),
      };
    },

    async createSupplier(input, actor, capabilities) {
      if (!capabilities.manageSuppliers) {
        throw new ProcurementError('FORBIDDEN', 'Not allowed.', 403);
      }
      const values = normalizeSupplier(input);
      const now = new Date();
      const result = await query
        .insertInto('procurementSuppliers')
        .values({
          ...values,
          createdById: actor.id,
          createdByName: actor.name,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const id = Number(result.insertId);
      return this.getSupplier(id);
    },

    async updateSupplier(id, input, capabilities) {
      if (!capabilities.manageSuppliers) {
        throw new ProcurementError('FORBIDDEN', 'Not allowed.', 403);
      }
      const values = normalizeSupplier(input);
      const result = await query
        .updateTable('procurementSuppliers')
        .set({ ...values, updatedAt: new Date() })
        .where('id', '=', id)
        .execute();
      if ((result.updatedCount ?? 0) === 0) {
        throw new ProcurementError(
          'SUPPLIER_NOT_FOUND',
          'Supplier not found.',
          404,
        );
      }
      return this.getSupplier(id);
    },

    async listRequests(actor, capabilities) {
      let builder = query
        .selectFrom('procurementRequests')
        .selectAll()
        .orderBy('id', 'desc');
      if (!capabilities.viewAllRequests) {
        builder = builder.where('applicantId', '=', actor.id);
      }
      const rows = await builder.execute();
      return Promise.all(rows.map((row) => hydrateRequest(query, row, false)));
    },

    async getRequest(id, actor, capabilities) {
      const row = await query
        .selectFrom('procurementRequests')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) {
        throw new ProcurementError(
          'REQUEST_NOT_FOUND',
          'Request not found.',
          404,
        );
      }
      const applicantId = String(row.applicantId);
      if (!capabilities.viewAllRequests && applicantId !== actor.id) {
        throw new ProcurementError('FORBIDDEN', 'Not allowed.', 403);
      }
      return hydrateRequest(query, row, true);
    },

    async createRequest(input, actor) {
      const { items, totalAmount } = normalizeRequestItems(input.items);
      const now = new Date();
      const result = await query
        .insertInto('procurementRequests')
        .values({
          applicantId: actor.id,
          applicantName: actor.name,
          department: optionalText(input.department),
          description: optionalText(input.description),
          expectedDate: optionalDate(input.expectedDate),
          status: 'draft',
          rejectReason: null,
          totalAmount,
          submittedAt: null,
          approvedAt: null,
          approvedById: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const id = Number(result.insertId);
      await insertItems(query, id, items);
      return this.getRequest(id, actor, {
        ...describeCapabilities([]),
        viewAllRequests: true,
      });
    },

    async updateRequest(id, input, actor, capabilities) {
      const existing = await requireRequestRow(query, id);
      assertEditable(existing, actor, capabilities);
      const { items, totalAmount } = normalizeRequestItems(input.items);
      await query
        .deleteFrom('procurementRequestItems')
        .where('requestId', '=', id)
        .execute();
      await insertItems(query, id, items);
      await query
        .updateTable('procurementRequests')
        .set({
          department: optionalText(input.department),
          description: optionalText(input.description),
          expectedDate: optionalDate(input.expectedDate),
          totalAmount,
          updatedAt: new Date(),
        })
        .where('id', '=', id)
        .execute();
      return hydrateRequest(query, await requireRequestRow(query, id), true);
    },

    async submitRequest(id, actor, capabilities) {
      const existing = await requireRequestRow(query, id);
      assertEditable(existing, actor, capabilities);
      await query
        .updateTable('procurementRequests')
        .set({
          status: 'pending',
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where('id', '=', id)
        .execute();
      return hydrateRequest(query, await requireRequestRow(query, id), true);
    },

    async approveRequest(id, actor) {
      const existing = await requireRequestRow(query, id);
      if (existing.status !== 'pending') {
        throw new ProcurementError(
          'REQUEST_NOT_PENDING',
          'Only a pending request can be approved.',
          409,
        );
      }
      await query
        .updateTable('procurementRequests')
        .set({
          status: 'approved',
          rejectReason: null,
          approvedAt: new Date(),
          approvedById: actor.id,
          updatedAt: new Date(),
        })
        .where('id', '=', id)
        .execute();
      return hydrateRequest(query, await requireRequestRow(query, id), true);
    },

    async rejectRequest(id, actor, reason) {
      const trimmed = String(reason ?? '').trim();
      if (!trimmed) {
        throw new ProcurementError(
          'REJECT_REASON_REQUIRED',
          'A rejection reason is required.',
        );
      }
      const existing = await requireRequestRow(query, id);
      if (existing.status !== 'pending') {
        throw new ProcurementError(
          'REQUEST_NOT_PENDING',
          'Only a pending request can be rejected.',
          409,
        );
      }
      await query
        .updateTable('procurementRequests')
        .set({
          status: 'rejected',
          rejectReason: trimmed,
          approvedById: actor.id,
          updatedAt: new Date(),
        })
        .where('id', '=', id)
        .execute();
      return hydrateRequest(query, await requireRequestRow(query, id), true);
    },

    async listOrders() {
      const rows = await query
        .selectFrom('procurementOrders')
        .selectAll()
        .orderBy('id', 'desc')
        .execute();
      return Promise.all(rows.map((row) => hydrateOrder(query, row, false)));
    },

    async getOrder(id) {
      const row = await query
        .selectFrom('procurementOrders')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) {
        throw new ProcurementError('ORDER_NOT_FOUND', 'Order not found.', 404);
      }
      return hydrateOrder(query, row, true);
    },

    async createOrderFromRequest(input, actor) {
      const request = await requireRequestRow(query, input.requestId);
      if (request.status !== 'approved') {
        throw new ProcurementError(
          'REQUEST_NOT_APPROVED',
          'Only an approved request can produce an order.',
          409,
        );
      }
      const existingOrder = await query
        .selectFrom('procurementOrders')
        .select('id')
        .where('requestId', '=', input.requestId)
        .executeTakeFirst();
      if (existingOrder) {
        throw new ProcurementError(
          'ORDER_ALREADY_EXISTS',
          'An order already exists for this request.',
          409,
        );
      }
      const supplier = await query
        .selectFrom('procurementSuppliers')
        .select(['id', 'name', 'status'])
        .where('id', '=', input.supplierId)
        .executeTakeFirst();
      if (!supplier) {
        throw new ProcurementError(
          'SUPPLIER_NOT_FOUND',
          'Supplier not found.',
          404,
        );
      }
      if (supplier.status !== 'active') {
        throw new ProcurementError(
          'SUPPLIER_INACTIVE',
          'A disabled supplier cannot be used for new orders.',
          409,
        );
      }
      const items = await query
        .selectFrom('procurementRequestItems')
        .select('quantity')
        .where('requestId', '=', input.requestId)
        .execute();
      const totalQuantity = roundMoney(
        items.reduce((sum, item) => sum + Number(item.quantity), 0),
      );
      const now = new Date();
      const result = await query
        .insertInto('procurementOrders')
        .values({
          orderNumber: createOrderNumber(now),
          requestId: input.requestId,
          supplierId: input.supplierId,
          supplierName: String(supplier.name),
          amount: Number(request.totalAmount),
          totalQuantity,
          receivedQuantity: 0,
          orderDate:
            optionalDate(input.orderDate) ?? now.toISOString().slice(0, 10),
          status: 'ordered',
          createdById: actor.id,
          createdByName: actor.name,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return this.getOrder(Number(result.insertId));
    },

    async createReceipt(orderId, input, actor) {
      const order = await requireOrderRow(query, orderId);
      if (order.status === 'received') {
        throw new ProcurementError(
          'ORDER_ALREADY_RECEIVED',
          'This order has already been fully received.',
          409,
        );
      }
      const totalQuantity = Number(order.totalQuantity);
      const receivedQuantity = Number(order.receivedQuantity);
      assertReceivable(totalQuantity, receivedQuantity, Number(input.quantity));
      const quantity = roundMoney(Number(input.quantity));
      const nextReceived = roundMoney(receivedQuantity + quantity);
      const receivedDate =
        optionalDate(input.receivedDate) ??
        new Date().toISOString().slice(0, 10);
      const now = new Date();
      await query
        .insertInto('procurementReceipts')
        .values({
          orderId,
          quantity,
          receivedDate,
          createdById: actor.id,
          createdAt: now,
        })
        .execute();
      await query
        .updateTable('procurementOrders')
        .set({
          receivedQuantity: nextReceived,
          status: orderStatusFor(totalQuantity, nextReceived),
          updatedAt: now,
        })
        .where('id', '=', orderId)
        .execute();
      return this.getOrder(orderId);
    },

    async listAttachments(ownerType, ownerId) {
      const rows = await query
        .selectFrom('procurementAttachments')
        .selectAll()
        .where('ownerType', '=', ownerType)
        .where('ownerId', '=', ownerId)
        .orderBy('id', 'asc')
        .execute();
      return rows.map(mapAttachment);
    },

    async addAttachment(ownerType, ownerId, fileId) {
      const file = await query
        .selectFrom('procurementFiles')
        .select(['id', 'filename'])
        .where('id', '=', fileId)
        .executeTakeFirst();
      if (!file) {
        throw new ProcurementError(
          'FILE_NOT_FOUND',
          'Uploaded file not found.',
          404,
        );
      }
      const result = await query
        .insertInto('procurementAttachments')
        .values({
          ownerType,
          ownerId,
          fileId,
          filename: nullableString(file.filename),
          createdAt: new Date(),
        })
        .execute();
      const row = await query
        .selectFrom('procurementAttachments')
        .selectAll()
        .where('id', '=', Number(result.insertId))
        .executeTakeFirstOrThrow();
      return mapAttachment(row);
    },

    async removeAttachment(id) {
      const result = await query
        .deleteFrom('procurementAttachments')
        .where('id', '=', id)
        .execute();
      if ((result.deletedCount ?? 0) === 0) {
        throw new ProcurementError(
          'ATTACHMENT_NOT_FOUND',
          'Attachment not found.',
          404,
        );
      }
    },

    async getAttachment(id) {
      const row = await query
        .selectFrom('procurementAttachments')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) {
        throw new ProcurementError(
          'ATTACHMENT_NOT_FOUND',
          'Attachment not found.',
          404,
        );
      }
      return mapAttachment(row);
    },

    async statistics() {
      const orders = await query
        .selectFrom('procurementOrders')
        .select(['supplierId', 'supplierName', 'amount', 'orderDate'])
        .execute();
      const pending = await query
        .selectFrom('procurementRequests')
        .select('id')
        .where('status', '=', 'pending')
        .execute();

      const supplierTotals = new Map<
        number,
        { supplierName: string; total: number }
      >();
      const monthTotals = new Map<string, number>();
      for (const order of orders) {
        const supplierId = Number(order.supplierId);
        const amount = Number(order.amount);
        const current = supplierTotals.get(supplierId) ?? {
          supplierName: toText(order.supplierName),
          total: 0,
        };
        current.total = roundMoney(current.total + amount);
        supplierTotals.set(supplierId, current);

        const orderDate = toText(order.orderDate);
        const month = orderDate.slice(0, 7);
        if (month) {
          monthTotals.set(
            month,
            roundMoney((monthTotals.get(month) ?? 0) + amount),
          );
        }
      }
      return {
        pendingApprovalCount: pending.length,
        bySupplier: [...supplierTotals.entries()]
          .map(([supplierId, value]) => ({
            supplierId,
            supplierName: value.supplierName,
            total: value.total,
          }))
          .sort((a, b) => b.total - a.total),
        byMonth: [...monthTotals.entries()]
          .map(([month, total]) => ({ month, total }))
          .sort((a, b) => a.month.localeCompare(b.month)),
      };
    },
  };
}

function normalizeSupplier(input: SupplierInput): Row {
  const name = String(input.name ?? '').trim();
  if (!name) {
    throw new ProcurementError(
      'SUPPLIER_NAME_REQUIRED',
      'Supplier name is required.',
    );
  }
  const category = String(input.category ?? '').trim();
  if (!SUPPLIER_CATEGORIES.includes(category as never)) {
    throw new ProcurementError(
      'SUPPLIER_CATEGORY_INVALID',
      'Invalid supplier category.',
    );
  }
  const status = String(input.status ?? '').trim();
  if (!SUPPLIER_STATUSES.includes(status as never)) {
    throw new ProcurementError(
      'SUPPLIER_STATUS_INVALID',
      'Invalid supplier status.',
    );
  }
  return {
    name,
    unifiedSocialCreditCode: optionalText(input.unifiedSocialCreditCode),
    contactName: optionalText(input.contactName),
    contactPhone: optionalText(input.contactPhone),
    category,
    status,
  };
}

function optionalText(value: unknown): string | null {
  const text = toText(value).trim();
  return text ? text : null;
}

function optionalDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const text = toText(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

/** Narrow an unknown column value to text without stringifying objects. */
function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return '';
}

function createOrderNumber(now: Date): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
  return `PO-${date}-${suffix}`;
}

async function insertItems(
  query: ReturnType<DatabaseManager['query']>,
  requestId: number,
  items: readonly NormalizedRequestItem[],
): Promise<void> {
  for (const item of items) {
    await query
      .insertInto('procurementRequestItems')
      .values({
        requestId,
        materialName: item.materialName,
        specification: item.specification,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount,
      })
      .execute();
  }
}

async function requireRequestRow(
  query: ReturnType<DatabaseManager['query']>,
  id: number,
): Promise<Row> {
  const row = await query
    .selectFrom('procurementRequests')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  if (!row) {
    throw new ProcurementError('REQUEST_NOT_FOUND', 'Request not found.', 404);
  }
  return row;
}

async function requireOrderRow(
  query: ReturnType<DatabaseManager['query']>,
  id: number,
): Promise<Row> {
  const row = await query
    .selectFrom('procurementOrders')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  if (!row) {
    throw new ProcurementError('ORDER_NOT_FOUND', 'Order not found.', 404);
  }
  return row;
}

function assertEditable(
  row: Row,
  actor: ProcurementActor,
  capabilities: ProcurementCapabilities,
): void {
  if (String(row.applicantId) !== actor.id && !capabilities.isAdministrator) {
    throw new ProcurementError('FORBIDDEN', 'Not allowed.', 403);
  }
  if (row.status !== 'draft') {
    throw new ProcurementError(
      'REQUEST_NOT_DRAFT',
      'Only a draft request can be changed.',
      409,
    );
  }
}

function mapSupplier(row: Row): ProcurementSupplier {
  return {
    id: Number(row.id),
    name: String(row.name),
    unifiedSocialCreditCode: nullableString(row.unifiedSocialCreditCode),
    contactName: nullableString(row.contactName),
    contactPhone: nullableString(row.contactPhone),
    category: String(row.category),
    status: String(row.status),
    files: [],
    createdAt: toIso(row.createdAt),
  };
}

function mapAttachment(row: Row): ProcurementAttachment {
  const fileId = String(row.fileId);
  return {
    id: Number(row.id),
    ownerType: String(row.ownerType),
    ownerId: String(row.ownerId),
    fileId,
    filename: nullableString(row.filename),
    contentUrl: `/api/procurement/attachments/${Number(row.id)}/content`,
  };
}

async function hydrateRequest(
  query: ReturnType<DatabaseManager['query']>,
  row: Row,
  withItems: boolean,
): Promise<ProcurementRequest> {
  const id = Number(row.id);
  const items = withItems ? await loadItems(query, id) : [];
  const files = await loadAttachments(query, 'request', String(id));
  return {
    id,
    applicantId: String(row.applicantId),
    applicantName: nullableString(row.applicantName),
    department: nullableString(row.department),
    description: nullableString(row.description),
    expectedDate: nullableString(row.expectedDate),
    status: String(row.status) as RequestStatus,
    rejectReason: nullableString(row.rejectReason),
    totalAmount: Number(row.totalAmount),
    submittedAt: nullableString(row.submittedAt),
    approvedAt: nullableString(row.approvedAt),
    items,
    files,
    createdAt: toIso(row.createdAt),
  };
}

async function loadItems(
  query: ReturnType<DatabaseManager['query']>,
  requestId: number,
): Promise<ProcurementRequestItem[]> {
  const rows = await query
    .selectFrom('procurementRequestItems')
    .selectAll()
    .where('requestId', '=', requestId)
    .orderBy('id', 'asc')
    .execute();
  return rows.map((item) => ({
    id: Number(item.id),
    materialName: String(item.materialName),
    specification: nullableString(item.specification),
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    amount: Number(item.amount),
  }));
}

async function loadAttachments(
  query: ReturnType<DatabaseManager['query']>,
  ownerType: string,
  ownerId: string,
): Promise<ProcurementAttachment[]> {
  const rows = await query
    .selectFrom('procurementAttachments')
    .selectAll()
    .where('ownerType', '=', ownerType)
    .where('ownerId', '=', ownerId)
    .orderBy('id', 'asc')
    .execute();
  return rows.map(mapAttachment);
}

async function hydrateOrder(
  query: ReturnType<DatabaseManager['query']>,
  row: Row,
  withReceipts: boolean,
): Promise<ProcurementOrder> {
  const id = Number(row.id);
  const receipts = withReceipts ? await loadReceipts(query, id) : [];
  return {
    id,
    orderNumber: String(row.orderNumber),
    requestId: row.requestId === null ? null : Number(row.requestId),
    supplierId: Number(row.supplierId),
    supplierName: nullableString(row.supplierName),
    amount: Number(row.amount),
    totalQuantity: Number(row.totalQuantity),
    receivedQuantity: Number(row.receivedQuantity),
    orderDate: nullableString(row.orderDate) ?? '',
    status: String(row.status) as OrderStatus,
    receipts,
    createdAt: toIso(row.createdAt),
  };
}

async function loadReceipts(
  query: ReturnType<DatabaseManager['query']>,
  orderId: number,
): Promise<ProcurementReceipt[]> {
  const rows = await query
    .selectFrom('procurementReceipts')
    .selectAll()
    .where('orderId', '=', orderId)
    .orderBy('id', 'asc')
    .execute();
  return rows.map((row) => ({
    id: Number(row.id),
    orderId: Number(row.orderId),
    quantity: Number(row.quantity),
    receivedDate: nullableString(row.receivedDate) ?? '',
    createdAt: toIso(row.createdAt),
  }));
}

function nullableString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return toText(value);
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return toText(value);
}

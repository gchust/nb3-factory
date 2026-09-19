import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { databaseManagerToken } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceResolver,
} from '@nocobase/service-provider';

/**
 * The file exposure this module owns. The collection is the File Repository
 * metadata table; the access path is served by the plugin's content route, which
 * the module guards with its own authentication and authorization middleware.
 */
export const PROCUREMENT_FILE_RESOURCE = 'procurementFiles';
export const PROCUREMENT_FILE_COLLECTION = 'procurementFiles';
export const PROCUREMENT_FILE_ACCESS_PATH = '/uploads/procurement-files';
export const PROCUREMENT_FILE_DISK = 'local';

export const procurementServiceToken = createServiceToken<ProcurementService>(
  'app/procurement/service',
);

export const PROCUREMENT_ROLE_KEYS = {
  manager: 'procurement-manager',
  buyer: 'procurement-buyer',
  warehouse: 'warehouse-keeper',
} as const;

export const SYSTEM_ADMINISTRATOR_ROLE = 'system-administrator';

export type ProcurementRole = keyof typeof PROCUREMENT_ROLE_KEYS;
export type AttachmentTargetType = 'supplier' | 'order' | 'receipt';
export type AttachmentCategory =
  | 'license'
  | 'qualification'
  | 'quotation'
  | 'contract'
  | 'signed_photo'
  | 'delivery_note';

export const ATTACHMENT_CATEGORIES: Readonly<
  Record<AttachmentTargetType, readonly AttachmentCategory[]>
> = {
  supplier: ['license', 'qualification'],
  order: ['quotation', 'contract'],
  receipt: ['signed_photo', 'delivery_note'],
};

export const MAX_ATTACHMENTS_PER_REQUEST = 5;

/**
 * The per-file ceiling shown in the UI. The upload action only bounds the whole
 * multipart body, so the same limit is enforced here when files are linked to a
 * document; the client checks it earlier to give a reason without uploading.
 */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export interface ProcurementPrincipal {
  readonly userId: string;
  readonly name: string;
  readonly roles: ReadonlySet<ProcurementRole>;
  readonly isAdministrator: boolean;
}

export type OrderStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type ReceiptStatus = 'pending' | 'partial' | 'received';

export class ProcurementError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'ProcurementError';
  }
}

interface Numberish {
  readonly [key: string]: unknown;
}

function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export interface OrderItemInput {
  readonly materialId: number;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly expectedDate?: string | null;
  readonly remark?: string | null;
}

export interface OrderInput {
  readonly supplierId: number;
  readonly remark?: string | null;
  readonly items: readonly OrderItemInput[];
}

export interface ReceiptInput {
  readonly receivedAt?: string | null;
  readonly remark?: string | null;
  readonly requestId?: string | null;
  readonly items: readonly { orderItemId: number; quantity: number }[];
}

/**
 * Domain logic for the procurement module. It owns role resolution, record
 * scoping and the business rules; routes only parse HTTP input and translate
 * errors into responses.
 */
export class ProcurementService {
  public constructor(
    private readonly container: ServiceResolver,
    private readonly publicBasePath: string,
  ) {}

  private get database() {
    return this.container.resolve(databaseManagerToken);
  }

  private get authorization() {
    return this.container.resolve(authorizationToken);
  }

  private fileRepository() {
    return this.container
      .resolve(serverFileRepositoryManagerToken)
      .repository(PROCUREMENT_FILE_COLLECTION, {
        connection: 'main',
        disk: PROCUREMENT_FILE_DISK,
        accessPath: PROCUREMENT_FILE_ACCESS_PATH,
        // The server-side repository is unrestricted (as `db.repository()` is);
        // the Policy only has to permit the metadata delete this module performs.
        policy: { read: true, create: true, update: false, delete: true },
      });
  }

  public async principal(
    userId: string,
    name: string,
  ): Promise<ProcurementPrincipal> {
    const assignments =
      await this.authorization.permissionSets.listAssignments();
    const keys = new Set(
      assignments
        .filter(
          (assignment) =>
            assignment.subject.type === 'user' &&
            String(assignment.subject.id) === userId,
        )
        .map((assignment) => assignment.permissionSet),
    );
    const roles = new Set<ProcurementRole>();
    for (const [role, key] of Object.entries(PROCUREMENT_ROLE_KEYS)) {
      if (keys.has(key)) roles.add(role as ProcurementRole);
    }
    return {
      userId,
      name,
      roles,
      isAdministrator: keys.has(SYSTEM_ADMINISTRATOR_ROLE),
    };
  }

  private isManager(principal: ProcurementPrincipal): boolean {
    return principal.isAdministrator || principal.roles.has('manager');
  }

  private isBuyer(principal: ProcurementPrincipal): boolean {
    return principal.roles.has('buyer');
  }

  private isWarehouse(principal: ProcurementPrincipal): boolean {
    return principal.roles.has('warehouse');
  }

  public canListOrders(principal: ProcurementPrincipal): boolean {
    return (
      this.isManager(principal) ||
      this.isBuyer(principal) ||
      this.isWarehouse(principal)
    );
  }

  // -- Suppliers -----------------------------------------------------------

  public async listSuppliers(principal: ProcurementPrincipal) {
    const query = this.database.query();
    let rows: Numberish[];
    if (this.isManager(principal) || this.isWarehouse(principal)) {
      rows = await query
        .selectFrom('suppliers')
        .selectAll()
        .orderBy('id', 'asc')
        .execute();
    } else if (this.isBuyer(principal)) {
      rows = await query
        .selectFrom('suppliers')
        .selectAll()
        .where('ownerId', '=', principal.userId)
        .orderBy('id', 'asc')
        .execute();
    } else {
      return [];
    }
    const ownerNames = await this.userNames(
      rows.map((row) => String(row.ownerId)),
    );
    return rows.map((row) => this.supplierShape(row, ownerNames));
  }

  public async getSupplier(principal: ProcurementPrincipal, id: number) {
    const row = await this.database
      .query()
      .selectFrom('suppliers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row)
      throw new ProcurementError('NOT_FOUND', 404, 'Supplier not found.');
    if (!(await this.canReadSupplier(principal, row))) {
      throw new ProcurementError('FORBIDDEN', 403, 'Not allowed.');
    }
    const ownerNames = await this.userNames([String(row.ownerId)]);
    return this.supplierShape(row, ownerNames);
  }

  public async createSupplier(
    principal: ProcurementPrincipal,
    input: {
      name?: unknown;
      contactName?: unknown;
      phone?: unknown;
      status?: unknown;
      remark?: unknown;
      ownerId?: unknown;
    },
  ) {
    if (!this.isManager(principal) && !this.isBuyer(principal)) {
      throw new ProcurementError('FORBIDDEN', 403, 'Not allowed.');
    }
    const name = requireText(input.name, 'name');
    const status = input.status === 'inactive' ? 'inactive' : 'active';
    const existing = await this.database
      .query()
      .selectFrom('suppliers')
      .select('id')
      .where('name', '=', name)
      .executeTakeFirst();
    if (existing) {
      throw new ProcurementError(
        'SUPPLIER_NAME_TAKEN',
        409,
        'Supplier name exists.',
      );
    }
    const now = new Date();
    const ownerId = this.isManager(principal)
      ? (optionalText(input.ownerId) ?? principal.userId)
      : principal.userId;
    await this.database
      .query()
      .insertInto('suppliers')
      .values({
        name,
        contactName: optionalText(input.contactName),
        phone: optionalText(input.phone),
        status,
        ownerId,
        remark: optionalText(input.remark),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const created = await this.database
      .query()
      .selectFrom('suppliers')
      .selectAll()
      .where('name', '=', name)
      .executeTakeFirstOrThrow();
    return this.getSupplier(principal, Number(created.id));
  }

  public async updateSupplier(
    principal: ProcurementPrincipal,
    id: number,
    input: {
      name?: unknown;
      contactName?: unknown;
      phone?: unknown;
      status?: unknown;
      remark?: unknown;
    },
  ) {
    const row = await this.database
      .query()
      .selectFrom('suppliers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row)
      throw new ProcurementError('NOT_FOUND', 404, 'Supplier not found.');
    if (!this.canWriteSupplier(principal, row)) {
      throw new ProcurementError('FORBIDDEN', 403, 'Not allowed.');
    }
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) values.name = requireText(input.name, 'name');
    if (input.contactName !== undefined)
      values.contactName = optionalText(input.contactName);
    if (input.phone !== undefined) values.phone = optionalText(input.phone);
    if (input.status !== undefined) {
      values.status = input.status === 'inactive' ? 'inactive' : 'active';
    }
    if (input.remark !== undefined) values.remark = optionalText(input.remark);
    if (typeof values.name === 'string') {
      const duplicate = await this.database
        .query()
        .selectFrom('suppliers')
        .select('id')
        .where('name', '=', values.name)
        .where('id', '!=', id)
        .executeTakeFirst();
      if (duplicate) {
        throw new ProcurementError(
          'SUPPLIER_NAME_TAKEN',
          409,
          'Supplier name exists.',
        );
      }
    }
    await this.database
      .query()
      .updateTable('suppliers')
      .set(values)
      .where('id', '=', id)
      .execute();
    return this.getSupplier(principal, id);
  }

  private async canReadSupplier(
    principal: ProcurementPrincipal,
    row: Numberish,
  ): Promise<boolean> {
    if (this.isManager(principal) || this.isWarehouse(principal)) return true;
    return this.isBuyer(principal) && String(row.ownerId) === principal.userId;
  }

  private canWriteSupplier(
    principal: ProcurementPrincipal,
    row: Numberish,
  ): boolean {
    if (this.isManager(principal)) return true;
    return this.isBuyer(principal) && String(row.ownerId) === principal.userId;
  }

  public async canReadSupplierById(
    principal: ProcurementPrincipal,
    id: number,
  ): Promise<boolean> {
    const row = await this.database
      .query()
      .selectFrom('suppliers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? this.canReadSupplier(principal, row) : false;
  }

  private supplierShape(
    row: Numberish,
    ownerNames: ReadonlyMap<string, string>,
  ) {
    return {
      id: Number(row.id),
      name: String(row.name),
      contactName: asOptionalString(row.contactName),
      phone: asOptionalString(row.phone),
      status: String(row.status),
      ownerId: String(row.ownerId),
      ownerName: ownerNames.get(String(row.ownerId)) ?? null,
      remark: asOptionalString(row.remark),
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }

  // -- Materials -----------------------------------------------------------

  public async listMaterials() {
    const rows = await this.database
      .query()
      .selectFrom('materials')
      .selectAll()
      .orderBy('code', 'asc')
      .execute();
    return rows.map((row) => this.materialShape(row));
  }

  public async createMaterial(
    principal: ProcurementPrincipal,
    input: { code?: unknown; name?: unknown; spec?: unknown; unit?: unknown },
  ) {
    if (!this.isManager(principal) && !this.isBuyer(principal)) {
      throw new ProcurementError('FORBIDDEN', 403, 'Not allowed.');
    }
    const code = requireText(input.code, 'code');
    const existing = await this.database
      .query()
      .selectFrom('materials')
      .select('id')
      .where('code', '=', code)
      .executeTakeFirst();
    if (existing) {
      throw new ProcurementError(
        'MATERIAL_CODE_TAKEN',
        409,
        'Material code exists.',
      );
    }
    const now = new Date();
    await this.database
      .query()
      .insertInto('materials')
      .values({
        code,
        name: requireText(input.name, 'name'),
        spec: optionalText(input.spec),
        unit: requireText(input.unit, 'unit'),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return this.materialByCode(code);
  }

  public async updateMaterial(
    principal: ProcurementPrincipal,
    id: number,
    input: { code?: unknown; name?: unknown; spec?: unknown; unit?: unknown },
  ) {
    if (!this.isManager(principal) && !this.isBuyer(principal)) {
      throw new ProcurementError('FORBIDDEN', 403, 'Not allowed.');
    }
    const row = await this.database
      .query()
      .selectFrom('materials')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row)
      throw new ProcurementError('NOT_FOUND', 404, 'Material not found.');
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (input.code !== undefined) values.code = requireText(input.code, 'code');
    if (input.name !== undefined) values.name = requireText(input.name, 'name');
    if (input.spec !== undefined) values.spec = optionalText(input.spec);
    if (input.unit !== undefined) values.unit = requireText(input.unit, 'unit');
    if (typeof values.code === 'string') {
      const duplicate = await this.database
        .query()
        .selectFrom('materials')
        .select('id')
        .where('code', '=', values.code)
        .where('id', '!=', id)
        .executeTakeFirst();
      if (duplicate) {
        throw new ProcurementError(
          'MATERIAL_CODE_TAKEN',
          409,
          'Material code exists.',
        );
      }
    }
    await this.database
      .query()
      .updateTable('materials')
      .set(values)
      .where('id', '=', id)
      .execute();
    const updated = await this.database
      .query()
      .selectFrom('materials')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    return this.materialShape(updated);
  }

  private async materialByCode(code: string) {
    const row = await this.database
      .query()
      .selectFrom('materials')
      .selectAll()
      .where('code', '=', code)
      .executeTakeFirstOrThrow();
    return this.materialShape(row);
  }

  private materialShape(row: Numberish) {
    return {
      id: Number(row.id),
      code: String(row.code),
      name: String(row.name),
      spec: asOptionalString(row.spec),
      unit: String(row.unit),
    };
  }

  // -- Orders --------------------------------------------------------------

  public async listOrders(
    principal: ProcurementPrincipal,
    filters: { status?: string; scope?: string } = {},
  ) {
    const query = this.database.query();
    let base = query.selectFrom('purchaseOrders').selectAll();
    if (this.isManager(principal)) {
      base = filters.status ? base.where('status', '=', filters.status) : base;
    } else if (this.isBuyer(principal)) {
      base = base.where('buyerId', '=', principal.userId);
      if (filters.status) base = base.where('status', '=', filters.status);
    } else if (this.isWarehouse(principal)) {
      base = base.where('status', '=', 'approved');
    } else {
      return [];
    }
    if (filters.scope === 'todo' && !this.isManager(principal)) return [];
    const rows = await base.orderBy('id', 'desc').execute();
    const shapes = await this.orderShapes(rows);
    if (filters.scope === 'todo') {
      return shapes.filter((order) => order.status === 'submitted');
    }
    return shapes;
  }

  public async todoOrders(principal: ProcurementPrincipal) {
    if (!this.isManager(principal)) return [];
    const rows = await this.database
      .query()
      .selectFrom('purchaseOrders')
      .selectAll()
      .where('status', '=', 'submitted')
      .orderBy('submittedAt', 'asc')
      .execute();
    const shapes = await this.orderShapes(rows);
    // A reviewer cannot decide on their own order, so it is not a todo item.
    return shapes.filter((order) => order.buyerId !== principal.userId);
  }

  public async getOrder(principal: ProcurementPrincipal, id: number) {
    const row = await this.database
      .query()
      .selectFrom('purchaseOrders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new ProcurementError('NOT_FOUND', 404, 'Order not found.');
    if (!(await this.canReadOrder(principal, row))) {
      throw new ProcurementError('FORBIDDEN', 403, 'Not allowed.');
    }
    const [shape] = await this.orderShapes([row], true);
    return shape;
  }

  public async createOrder(principal: ProcurementPrincipal, input: OrderInput) {
    if (!this.isManager(principal) && !this.isBuyer(principal)) {
      throw new ProcurementError('FORBIDDEN', 403, 'Not allowed.');
    }
    const supplierId = requirePositiveInt(input.supplierId, 'supplierId');
    const supplier = await this.database
      .query()
      .selectFrom('suppliers')
      .selectAll()
      .where('id', '=', supplierId)
      .executeTakeFirst();
    if (!supplier)
      throw new ProcurementError(
        'SUPPLIER_NOT_FOUND',
        404,
        'Supplier not found.',
      );
    if (this.isBuyer(principal) && !this.isManager(principal)) {
      if (String(supplier.ownerId) !== principal.userId) {
        throw new ProcurementError(
          'SUPPLIER_NOT_OWNED',
          403,
          'Supplier belongs to another buyer.',
        );
      }
    }
    const items = await this.normalizeItems(input.items);
    const now = new Date();
    const orderNo = await this.nextOrderNo('PO');
    await this.database.transaction(async (connection) => {
      await connection.query
        .insertInto('purchaseOrders')
        .values({
          orderNo,
          supplierId,
          buyerId: principal.userId,
          status: 'draft',
          totalAmount: items.total,
          remark: optionalText(input.remark),
          rejectReason: null,
          submittedAt: null,
          reviewedAt: null,
          reviewerId: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const created = await connection.query
        .selectFrom('purchaseOrders')
        .select('id')
        .where('orderNo', '=', orderNo)
        .executeTakeFirstOrThrow();
      const orderId = Number(created.id);
      for (const item of items.rows) {
        await connection.query
          .insertInto('purchaseOrderItems')
          .values({
            orderId,
            materialId: item.materialId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.amount,
            receivedQuantity: 0,
            expectedDate: item.expectedDate,
            remark: item.remark,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    });
    const created = await this.database
      .query()
      .selectFrom('purchaseOrders')
      .select('id')
      .where('orderNo', '=', orderNo)
      .executeTakeFirstOrThrow();
    return this.getOrder(principal, Number(created.id));
  }

  public async updateOrder(
    principal: ProcurementPrincipal,
    id: number,
    input: OrderInput,
  ) {
    const order = await this.requireOrder(id);
    if (!this.canWriteOrder(principal, order)) {
      throw new ProcurementError('FORBIDDEN', 403, 'Not allowed.');
    }
    if (order.status !== 'draft' && order.status !== 'rejected') {
      throw new ProcurementError(
        'ORDER_NOT_EDITABLE',
        409,
        'Only draft or rejected orders can be edited.',
      );
    }
    const supplierId =
      input.supplierId === undefined
        ? Number(order.supplierId)
        : requirePositiveInt(input.supplierId, 'supplierId');
    const supplier = await this.database
      .query()
      .selectFrom('suppliers')
      .selectAll()
      .where('id', '=', supplierId)
      .executeTakeFirst();
    if (!supplier)
      throw new ProcurementError(
        'SUPPLIER_NOT_FOUND',
        404,
        'Supplier not found.',
      );
    if (this.isBuyer(principal) && !this.isManager(principal)) {
      if (String(supplier.ownerId) !== principal.userId) {
        throw new ProcurementError(
          'SUPPLIER_NOT_OWNED',
          403,
          'Supplier belongs to another buyer.',
        );
      }
    }
    const items = await this.normalizeItems(input.items);
    const now = new Date();
    await this.database.transaction(async (connection) => {
      await connection.query
        .updateTable('purchaseOrders')
        .set({
          supplierId,
          totalAmount: items.total,
          remark: optionalText(input.remark),
          updatedAt: now,
        })
        .where('id', '=', id)
        .execute();
      await connection.query
        .deleteFrom('purchaseOrderItems')
        .where('orderId', '=', id)
        .execute();
      for (const item of items.rows) {
        await connection.query
          .insertInto('purchaseOrderItems')
          .values({
            orderId: id,
            materialId: item.materialId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.amount,
            receivedQuantity: 0,
            expectedDate: item.expectedDate,
            remark: item.remark,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    });
    return this.getOrder(principal, id);
  }

  public async submitOrder(principal: ProcurementPrincipal, id: number) {
    const order = await this.requireOrder(id);
    if (!this.canWriteOrder(principal, order)) {
      throw new ProcurementError('FORBIDDEN', 403, 'Not allowed.');
    }
    if (order.status !== 'draft' && order.status !== 'rejected') {
      throw new ProcurementError(
        'ORDER_NOT_SUBMITTABLE',
        409,
        'Only draft or rejected orders can be submitted.',
      );
    }
    const items = await this.database
      .query()
      .selectFrom('purchaseOrderItems')
      .select('id')
      .where('orderId', '=', id)
      .execute();
    if (items.length === 0) {
      throw new ProcurementError(
        'ORDER_EMPTY',
        409,
        'An order needs at least one item.',
      );
    }
    await this.database
      .query()
      .updateTable('purchaseOrders')
      .set({
        status: 'submitted',
        submittedAt: new Date(),
        rejectReason: null,
        reviewedAt: null,
        reviewerId: null,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
    return this.getOrder(principal, id);
  }

  public async approveOrder(principal: ProcurementPrincipal, id: number) {
    return this.reviewOrder(principal, id, 'approved');
  }

  public async rejectOrder(
    principal: ProcurementPrincipal,
    id: number,
    reason: unknown,
  ) {
    return this.reviewOrder(
      principal,
      id,
      'rejected',
      requireText(reason, 'reason'),
    );
  }

  private async reviewOrder(
    principal: ProcurementPrincipal,
    id: number,
    decision: 'approved' | 'rejected',
    reason?: string,
  ) {
    if (!this.isManager(principal)) {
      throw new ProcurementError('FORBIDDEN', 403, 'Not allowed.');
    }
    const order = await this.requireOrder(id);
    if (order.status !== 'submitted') {
      throw new ProcurementError(
        'ORDER_NOT_REVIEWABLE',
        409,
        'Only submitted orders can be reviewed.',
      );
    }
    if (String(order.buyerId) === principal.userId) {
      throw new ProcurementError(
        'ORDER_SELF_APPROVAL',
        403,
        'An order cannot be reviewed by its creator.',
      );
    }
    await this.database
      .query()
      .updateTable('purchaseOrders')
      .set({
        status: decision,
        rejectReason: decision === 'rejected' ? (reason ?? null) : null,
        reviewedAt: new Date(),
        reviewerId: principal.userId,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
    return this.getOrder(principal, id);
  }

  private async requireOrder(id: number): Promise<Numberish> {
    const row = await this.database
      .query()
      .selectFrom('purchaseOrders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new ProcurementError('NOT_FOUND', 404, 'Order not found.');
    return row;
  }

  private async canReadOrder(
    principal: ProcurementPrincipal,
    order: Numberish,
  ): Promise<boolean> {
    if (this.isManager(principal)) return true;
    if (this.isBuyer(principal))
      return String(order.buyerId) === principal.userId;
    if (this.isWarehouse(principal)) return order.status === 'approved';
    return false;
  }

  private canWriteOrder(
    principal: ProcurementPrincipal,
    order: Numberish,
  ): boolean {
    if (this.isManager(principal)) return true;
    return (
      this.isBuyer(principal) && String(order.buyerId) === principal.userId
    );
  }

  private async normalizeItems(items: unknown) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new ProcurementError(
        'ORDER_ITEMS_REQUIRED',
        400,
        'At least one item is required.',
      );
    }
    const materialIds = items.map((item) =>
      requirePositiveInt((item as OrderItemInput).materialId, 'materialId'),
    );
    const materials = await this.database
      .query()
      .selectFrom('materials')
      .select(['id'])
      .where('id', 'in', materialIds)
      .execute();
    const known = new Set(materials.map((row) => Number(row.id)));
    const rows = items.map((raw) => {
      const item = raw as OrderItemInput;
      const materialId = requirePositiveInt(item.materialId, 'materialId');
      if (!known.has(materialId)) {
        throw new ProcurementError(
          'MATERIAL_NOT_FOUND',
          404,
          'Material not found.',
        );
      }
      const quantity = requirePositiveNumber(item.quantity, 'quantity');
      const unitPrice = requireNonNegativeNumber(item.unitPrice, 'unitPrice');
      return {
        materialId,
        quantity,
        unitPrice,
        amount: round2(quantity * unitPrice),
        expectedDate: item.expectedDate ? new Date(item.expectedDate) : null,
        remark: optionalText(item.remark),
      };
    });
    const total = round2(rows.reduce((sum, row) => sum + row.amount, 0));
    return { rows, total };
  }

  private async orderShapes(
    rows: readonly Numberish[],
    withItems = false,
  ): Promise<ReturnType<ProcurementService['orderShape']>[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => Number(row.id));
    const supplierNames = await this.supplierNames(
      rows.map((row) => Number(row.supplierId)),
    );
    const userNames = await this.userNames([
      ...rows.map((row) => String(row.buyerId)),
      ...rows
        .filter((row) => row.reviewerId)
        .map((row) => String(row.reviewerId)),
    ]);
    const items = withItems
      ? await this.orderItemRows(ids)
      : await this.orderItemSummary(ids);
    return rows.map((row) =>
      this.orderShape(
        row,
        supplierNames,
        userNames,
        items.get(Number(row.id)) ?? [],
        withItems,
      ),
    );
  }

  private async orderItemRows(orderIds: readonly number[]) {
    const rows = await this.database
      .query()
      .selectFrom('purchaseOrderItems')
      .selectAll()
      .where('orderId', 'in', [...orderIds])
      .orderBy('id', 'asc')
      .execute();
    const materialIds = rows.map((row) => Number(row.materialId));
    const materials = await this.materialMap(materialIds);
    const map = new Map<number, unknown[]>();
    for (const row of rows) {
      const material = materials.get(Number(row.materialId));
      const quantity = num(row.quantity);
      const received = num(row.receivedQuantity);
      const list = map.get(Number(row.orderId)) ?? [];
      list.push({
        id: Number(row.id),
        materialId: Number(row.materialId),
        materialCode: material?.code ?? '',
        materialName: material?.name ?? '',
        spec: material?.spec ?? null,
        unit: material?.unit ?? '',
        quantity,
        unitPrice: num(row.unitPrice),
        amount: num(row.amount),
        receivedQuantity: received,
        remainingQuantity: round2(Math.max(0, quantity - received)),
        expectedDate: toDayString(row.expectedDate),
        remark: asOptionalString(row.remark),
      });
      map.set(Number(row.orderId), list);
    }
    return map;
  }

  private async orderItemSummary(orderIds: readonly number[]) {
    const rows = await this.database
      .query()
      .selectFrom('purchaseOrderItems')
      .select(['orderId', 'quantity', 'receivedQuantity', 'unitPrice'])
      .where('orderId', 'in', [...orderIds])
      .execute();
    const map = new Map<number, unknown[]>();
    for (const row of rows) {
      const list = map.get(Number(row.orderId)) ?? [];
      list.push({
        quantity: num(row.quantity),
        receivedQuantity: num(row.receivedQuantity),
        unitPrice: num(row.unitPrice),
      });
      map.set(Number(row.orderId), list);
    }
    return map;
  }

  private receiptStatus(
    items: readonly { quantity: number; receivedQuantity: number }[],
  ): ReceiptStatus {
    if (items.length === 0) return 'pending';
    const received = items.filter((item) => item.receivedQuantity > 0).length;
    if (received === 0) return 'pending';
    const complete = items.every(
      (item) => item.receivedQuantity >= item.quantity,
    );
    return complete ? 'received' : 'partial';
  }

  private orderShape(
    row: Numberish,
    supplierNames: ReadonlyMap<number, string>,
    userNames: ReadonlyMap<string, string>,
    items: readonly unknown[],
    withItems: boolean,
  ) {
    const normalized = items.map((item) => {
      const value = item as {
        quantity: number;
        receivedQuantity: number;
        unitPrice?: number;
        amount?: number;
        id?: number;
      };
      return value;
    });
    const receivedAmount = round2(
      normalized.reduce(
        (sum, item) =>
          sum +
          Math.min(item.receivedQuantity, item.quantity) *
            num(item.unitPrice ?? item.amount),
        0,
      ),
    );
    return {
      id: Number(row.id),
      orderNo: String(row.orderNo),
      supplierId: Number(row.supplierId),
      supplierName: supplierNames.get(Number(row.supplierId)) ?? null,
      buyerId: String(row.buyerId),
      buyerName: userNames.get(String(row.buyerId)) ?? null,
      status: String(row.status) as OrderStatus,
      totalAmount: num(row.totalAmount),
      remark: asOptionalString(row.remark),
      rejectReason: asOptionalString(row.rejectReason),
      submittedAt: toIso(row.submittedAt),
      reviewedAt: toIso(row.reviewedAt),
      reviewerId: asOptionalString(row.reviewerId),
      reviewerName: row.reviewerId
        ? (userNames.get(asString(row.reviewerId)) ?? null)
        : null,
      receiptStatus: this.receiptStatus(normalized),
      itemCount: normalized.length,
      receivedItemCount: normalized.filter((item) => item.receivedQuantity > 0)
        .length,
      receivedAmount,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
      ...(withItems ? { items: normalized } : {}),
    };
  }

  // -- Receipts ------------------------------------------------------------

  public async listReceipts(principal: ProcurementPrincipal) {
    const query = this.database.query();
    let base = query.selectFrom('goodsReceipts').selectAll();
    if (this.isManager(principal)) {
      // all
    } else if (this.isWarehouse(principal)) {
      base = base.where('receivedById', '=', principal.userId);
    } else if (this.isBuyer(principal)) {
      const orders = await this.database
        .query()
        .selectFrom('purchaseOrders')
        .select('id')
        .where('buyerId', '=', principal.userId)
        .execute();
      const ids = orders.map((row) => Number(row.id));
      if (ids.length === 0) return [];
      base = base.where('orderId', 'in', ids);
    } else {
      return [];
    }
    const rows = await base.orderBy('id', 'desc').execute();
    return this.receiptShapes(rows);
  }

  public async getReceipt(principal: ProcurementPrincipal, id: number) {
    const row = await this.database
      .query()
      .selectFrom('goodsReceipts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row)
      throw new ProcurementError('NOT_FOUND', 404, 'Receipt not found.');
    if (!(await this.canReadReceipt(principal, row))) {
      throw new ProcurementError('FORBIDDEN', 403, 'Not allowed.');
    }
    const [shape] = await this.receiptShapes([row]);
    return shape;
  }

  public async createReceipt(
    principal: ProcurementPrincipal,
    orderId: number,
    input: ReceiptInput,
  ) {
    if (!this.isManager(principal) && !this.isWarehouse(principal)) {
      throw new ProcurementError('FORBIDDEN', 403, 'Not allowed.');
    }
    const order = await this.requireOrder(orderId);
    if (order.status !== 'approved') {
      throw new ProcurementError(
        'ORDER_NOT_APPROVED',
        409,
        'Receipts can only be registered against approved orders.',
      );
    }
    const requestId = optionalText(input.requestId);
    if (requestId) {
      const existing = await this.database
        .query()
        .selectFrom('goodsReceipts')
        .select('id')
        .where('requestId', '=', requestId)
        .executeTakeFirst();
      if (existing) {
        const [shape] = await this.receiptShapes([
          await this.database
            .query()
            .selectFrom('goodsReceipts')
            .selectAll()
            .where('id', '=', Number(existing.id))
            .executeTakeFirstOrThrow(),
        ]);
        return { receipt: shape, duplicate: true };
      }
    }
    const rawItems: unknown = input.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new ProcurementError(
        'RECEIPT_ITEMS_REQUIRED',
        400,
        'At least one item is required.',
      );
    }
    const requested = new Map<number, number>();
    for (const raw of rawItems as readonly {
      orderItemId?: unknown;
      quantity?: unknown;
    }[]) {
      const orderItemId = requirePositiveInt(raw.orderItemId, 'orderItemId');
      const quantity = requirePositiveNumber(raw.quantity, 'quantity');
      requested.set(orderItemId, (requested.get(orderItemId) ?? 0) + quantity);
    }
    const orderItems = await this.database
      .query()
      .selectFrom('purchaseOrderItems')
      .selectAll()
      .where('orderId', '=', orderId)
      .execute();
    const byId = new Map(orderItems.map((row) => [Number(row.id), row]));
    for (const orderItemId of requested.keys()) {
      if (!byId.has(orderItemId)) {
        throw new ProcurementError(
          'RECEIPT_ITEM_NOT_IN_ORDER',
          400,
          'A receipt item does not belong to this order.',
          { orderItemId },
        );
      }
    }
    for (const [orderItemId, quantity] of requested) {
      const row = byId.get(orderItemId)!;
      const remaining = round2(num(row.quantity) - num(row.receivedQuantity));
      if (quantity > remaining + 1e-9) {
        throw new ProcurementError(
          'RECEIPT_QUANTITY_EXCEEDED',
          400,
          'Received quantity exceeds the ordered quantity.',
          { orderItemId, remaining, requested: quantity },
        );
      }
    }
    const receivedAt = input.receivedAt
      ? new Date(input.receivedAt)
      : new Date();
    const now = new Date();
    const receiptNo = await this.nextOrderNo('GR');
    const totalReceived = [...requested.values()].reduce(
      (sum, value) => sum + value,
      0,
    );
    if (totalReceived <= 0) {
      throw new ProcurementError(
        'RECEIPT_EMPTY',
        400,
        'Receipt quantity must be positive.',
      );
    }
    try {
      await this.database.transaction(async (connection) => {
        await connection.query
          .insertInto('goodsReceipts')
          .values({
            receiptNo,
            orderId,
            receivedById: principal.userId,
            receivedAt,
            remark: optionalText(input.remark),
            requestId,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        const created = await connection.query
          .selectFrom('goodsReceipts')
          .select('id')
          .where('receiptNo', '=', receiptNo)
          .executeTakeFirstOrThrow();
        const receiptId = Number(created.id);
        for (const [orderItemId, quantity] of requested) {
          await connection.query
            .insertInto('goodsReceiptItems')
            .values({
              receiptId,
              orderItemId,
              quantity,
              createdAt: now,
            })
            .execute();
          const row = byId.get(orderItemId)!;
          await connection.query
            .updateTable('purchaseOrderItems')
            .set({
              receivedQuantity: round2(num(row.receivedQuantity) + quantity),
            })
            .where('id', '=', orderItemId)
            .execute();
        }
      });
    } catch (error) {
      // A double-click can start two submissions of the same form before the
      // first answer arrives. Both pass the existence check above, and the
      // unique `requestId` index rejects the second insert. Resolve that race
      // to the already-saved receipt instead of failing an idempotent retry
      // with an unexpected 500.
      if (requestId) {
        const raced = await this.database
          .query()
          .selectFrom('goodsReceipts')
          .selectAll()
          .where('requestId', '=', requestId)
          .executeTakeFirst();
        if (raced) {
          const [shape] = await this.receiptShapes([raced]);
          return { receipt: shape, duplicate: true };
        }
      }
      throw error;
    }
    const created = await this.database
      .query()
      .selectFrom('goodsReceipts')
      .selectAll()
      .where('receiptNo', '=', receiptNo)
      .executeTakeFirstOrThrow();
    const [shape] = await this.receiptShapes([created]);
    return { receipt: shape, duplicate: false };
  }

  private async receiptShapes(rows: readonly Numberish[]) {
    if (rows.length === 0) return [];
    const receiptIds = rows.map((row) => Number(row.id));
    const items = await this.database
      .query()
      .selectFrom('goodsReceiptItems')
      .selectAll()
      .where('receiptId', 'in', receiptIds)
      .orderBy('id', 'asc')
      .execute();
    const orderItemIds = [
      ...new Set(items.map((row) => Number(row.orderItemId))),
    ];
    const orderItems =
      orderItemIds.length === 0
        ? []
        : await this.database
            .query()
            .selectFrom('purchaseOrderItems')
            .selectAll()
            .where('id', 'in', orderItemIds)
            .execute();
    const orderItemMap = new Map(
      orderItems.map((row) => [Number(row.id), row]),
    );
    const materialIds = orderItems.map((row) => Number(row.materialId));
    const materials = await this.materialMap(materialIds);
    const orderIds = [...new Set(rows.map((row) => Number(row.orderId)))];
    const orders = await this.database
      .query()
      .selectFrom('purchaseOrders')
      .selectAll()
      .where('id', 'in', orderIds)
      .execute();
    const orderMap = new Map(orders.map((row) => [Number(row.id), row]));
    const supplierNames = await this.supplierNames(
      orders.map((row) => Number(row.supplierId)),
    );
    const userNames = await this.userNames(
      rows.map((row) => String(row.receivedById)),
    );
    const itemMap = new Map<number, unknown[]>();
    for (const item of items) {
      const orderItem = orderItemMap.get(Number(item.orderItemId));
      const material = orderItem
        ? materials.get(Number(orderItem.materialId))
        : undefined;
      const list = itemMap.get(Number(item.receiptId)) ?? [];
      list.push({
        id: Number(item.id),
        orderItemId: Number(item.orderItemId),
        materialId: orderItem ? Number(orderItem.materialId) : null,
        materialCode: material?.code ?? '',
        materialName: material?.name ?? '',
        spec: material?.spec ?? null,
        unit: material?.unit ?? '',
        quantity: num(item.quantity),
      });
      itemMap.set(Number(item.receiptId), list);
    }
    return rows.map((row) => {
      const order = orderMap.get(Number(row.orderId));
      return {
        id: Number(row.id),
        receiptNo: String(row.receiptNo),
        orderId: Number(row.orderId),
        orderNo: order ? String(order.orderNo) : '',
        supplierName: order
          ? (supplierNames.get(Number(order.supplierId)) ?? null)
          : null,
        receivedById: String(row.receivedById),
        receivedByName: userNames.get(String(row.receivedById)) ?? null,
        receivedAt: toIso(row.receivedAt),
        remark: asOptionalString(row.remark),
        items: itemMap.get(Number(row.id)) ?? [],
        createdAt: toIso(row.createdAt),
      };
    });
  }

  private async canReadReceipt(
    principal: ProcurementPrincipal,
    receipt: Numberish,
  ): Promise<boolean> {
    if (this.isManager(principal) || this.isWarehouse(principal)) return true;
    if (!this.isBuyer(principal)) return false;
    const order = await this.database
      .query()
      .selectFrom('purchaseOrders')
      .select('buyerId')
      .where('id', '=', Number(receipt.orderId))
      .executeTakeFirst();
    return order ? String(order.buyerId) === principal.userId : false;
  }

  // -- Dashboard -----------------------------------------------------------

  public async dashboard(principal: ProcurementPrincipal) {
    const orders = await this.listOrders(principal);
    const receipts = await this.listReceipts(principal);
    const pendingApproval = this.isManager(principal)
      ? orders.filter((order) => order.status === 'submitted').length
      : 0;
    const pendingReceipt = orders.filter(
      (order) =>
        order.status === 'approved' && order.receiptStatus !== 'received',
    ).length;
    const approved = orders.filter((order) => order.status === 'approved');
    const totalPurchaseAmount = round2(
      approved.reduce((sum, order) => sum + order.totalAmount, 0),
    );
    const amountBySupplier = new Map<
      string,
      { supplierId: number; supplierName: string; amount: number }
    >();
    for (const order of approved) {
      const key = String(order.supplierId);
      const entry = amountBySupplier.get(key) ?? {
        supplierId: order.supplierId,
        supplierName: order.supplierName ?? '',
        amount: 0,
      };
      entry.amount = round2(entry.amount + order.totalAmount);
      amountBySupplier.set(key, entry);
    }
    return {
      orderCount: orders.length,
      pendingApproval,
      pendingReceipt,
      approvedCount: approved.length,
      receiptCount: receipts.length,
      totalPurchaseAmount,
      supplierAmounts: [...amountBySupplier.values()].sort(
        (left, right) => right.amount - left.amount,
      ),
      recentOrders: orders.slice(0, 6).map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        supplierName: order.supplierName,
        status: order.status,
        totalAmount: order.totalAmount,
        receiptStatus: order.receiptStatus,
        createdAt: order.createdAt,
      })),
    };
  }

  // -- Attachments ---------------------------------------------------------

  public async listAttachments(
    principal: ProcurementPrincipal,
    targetType: AttachmentTargetType,
    targetId: number,
  ) {
    if (!(await this.canReadTarget(principal, targetType, targetId))) {
      throw new ProcurementError('FORBIDDEN', 403, 'Not allowed.');
    }
    const rows = await this.database
      .query()
      .selectFrom('procurementAttachments')
      .selectAll()
      .where('targetType', '=', targetType)
      .where('targetId', '=', targetId)
      .orderBy('id', 'asc')
      .execute();
    const fileIds = rows.map((row) => String(row.fileId));
    const files =
      fileIds.length === 0
        ? []
        : await this.database
            .query()
            .selectFrom('procurementFiles')
            .selectAll()
            .where('id', 'in', fileIds)
            .execute();
    const fileMap = new Map(files.map((row) => [String(row.id), row]));
    const uploaderNames = await this.userNames(
      rows.map((row) => String(row.uploadedById)),
    );
    const canWrite = await this.canWriteTarget(principal, targetType, targetId);
    const items = rows
      .filter((row) => fileMap.has(String(row.fileId)))
      .map((row) => {
        const file = fileMap.get(String(row.fileId))!;
        return {
          id: Number(row.id),
          fileId: String(row.fileId),
          targetType,
          targetId,
          category: String(row.category) as AttachmentCategory,
          uploadedById: String(row.uploadedById),
          uploadedByName: uploaderNames.get(String(row.uploadedById)) ?? null,
          createdAt: toIso(row.createdAt),
          filename: String(file.filename),
          ext: String(file.ext),
          mimeType: String(file.mimeType),
          size: num(file.size),
          contentUrl: this.contentUrl(String(file.id), String(file.ext)),
          canWrite,
        };
      });
    return { items, canWrite };
  }

  public async attachFiles(
    principal: ProcurementPrincipal,
    input: {
      targetType?: unknown;
      targetId?: unknown;
      category?: unknown;
      fileIds?: unknown;
    },
  ) {
    const targetType = parseTargetType(input.targetType);
    const targetId = requirePositiveInt(input.targetId, 'targetId');
    const category = parseCategory(targetType, input.category);
    if (!(await this.canWriteTarget(principal, targetType, targetId))) {
      throw new ProcurementError('FORBIDDEN', 403, 'Not allowed.');
    }
    if (!Array.isArray(input.fileIds) || input.fileIds.length === 0) {
      throw new ProcurementError(
        'FILES_REQUIRED',
        400,
        'At least one file is required.',
      );
    }
    if (input.fileIds.length > MAX_ATTACHMENTS_PER_REQUEST) {
      throw new ProcurementError(
        'TOO_MANY_FILES',
        400,
        `At most ${MAX_ATTACHMENTS_PER_REQUEST} files may be attached at once.`,
        { limit: MAX_ATTACHMENTS_PER_REQUEST, requested: input.fileIds.length },
      );
    }
    const fileIds = input.fileIds.map((value) => requireText(value, 'fileId'));
    const files = await this.database
      .query()
      .selectFrom('procurementFiles')
      .select(['id', 'filename', 'size'])
      .where('id', 'in', fileIds)
      .execute();
    const byId = new Map(files.map((row) => [String(row.id), row]));
    for (const fileId of fileIds) {
      const file = byId.get(fileId);
      if (!file) {
        throw new ProcurementError(
          'FILE_NOT_FOUND',
          404,
          'Uploaded file not found.',
          {
            fileId,
          },
        );
      }
      // uploadMany only caps the whole request body, so an oversized single
      // file would otherwise reach the document.
      if (num(file.size) > MAX_ATTACHMENT_BYTES) {
        throw new ProcurementError(
          'FILE_TOO_LARGE',
          400,
          'A file exceeds the size limit.',
          {
            fileId,
            filename: String(file.filename),
            size: num(file.size),
            limit: MAX_ATTACHMENT_BYTES,
          },
        );
      }
    }
    const now = new Date();
    await this.database.transaction(async (connection) => {
      for (const fileId of fileIds) {
        await connection.query
          .insertInto('procurementAttachments')
          .values({
            fileId,
            targetType,
            targetId,
            category,
            uploadedById: principal.userId,
            createdAt: now,
          })
          .execute();
      }
    });
    return this.listAttachments(principal, targetType, targetId);
  }

  public async removeAttachment(principal: ProcurementPrincipal, id: number) {
    const row = await this.database
      .query()
      .selectFrom('procurementAttachments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row)
      throw new ProcurementError('NOT_FOUND', 404, 'Attachment not found.');
    const targetType = String(row.targetType) as AttachmentTargetType;
    const targetId = Number(row.targetId);
    if (!(await this.canWriteTarget(principal, targetType, targetId))) {
      throw new ProcurementError('FORBIDDEN', 403, 'Not allowed.');
    }
    await this.database
      .query()
      .deleteFrom('procurementAttachments')
      .where('id', '=', id)
      .execute();
    // The same upload may back more than one document (an operator can link one
    // file to several records). Only drop the stored object once no other link
    // references it; deleting it while another document still uses it would
    // break that document and leave a dangling attachment row behind.
    const remaining = await this.database
      .query()
      .selectFrom('procurementAttachments')
      .select('id')
      .where('fileId', '=', String(row.fileId))
      .execute();
    let fileDeleted = false;
    if (remaining.length === 0) {
      try {
        await this.fileRepository().deleteOne({
          filter: { id: String(row.fileId) },
        });
        fileDeleted = true;
      } catch {
        // The stored object and metadata are best-effort cleanup; the link is
        // gone so the file is no longer reachable through the business record.
      }
    }
    return { id, targetType, targetId, fileDeleted };
  }

  public async canReadTarget(
    principal: ProcurementPrincipal,
    targetType: AttachmentTargetType,
    targetId: number,
  ): Promise<boolean> {
    if (targetType === 'supplier') {
      return this.canReadSupplierById(principal, targetId);
    }
    if (targetType === 'order') {
      const order = await this.database
        .query()
        .selectFrom('purchaseOrders')
        .selectAll()
        .where('id', '=', targetId)
        .executeTakeFirst();
      return order ? this.canReadOrder(principal, order) : false;
    }
    const receipt = await this.database
      .query()
      .selectFrom('goodsReceipts')
      .selectAll()
      .where('id', '=', targetId)
      .executeTakeFirst();
    return receipt ? this.canReadReceipt(principal, receipt) : false;
  }

  public async canWriteTarget(
    principal: ProcurementPrincipal,
    targetType: AttachmentTargetType,
    targetId: number,
  ): Promise<boolean> {
    if (targetType === 'supplier') {
      const row = await this.database
        .query()
        .selectFrom('suppliers')
        .selectAll()
        .where('id', '=', targetId)
        .executeTakeFirst();
      return row ? this.canWriteSupplier(principal, row) : false;
    }
    if (targetType === 'order') {
      const row = await this.database
        .query()
        .selectFrom('purchaseOrders')
        .selectAll()
        .where('id', '=', targetId)
        .executeTakeFirst();
      if (!row) return false;
      const editable = row.status === 'draft' || row.status === 'rejected';
      return editable && this.canWriteOrder(principal, row);
    }
    const row = await this.database
      .query()
      .selectFrom('goodsReceipts')
      .selectAll()
      .where('id', '=', targetId)
      .executeTakeFirst();
    if (!row) return false;
    if (principal.isAdministrator || principal.roles.has('manager'))
      return true;
    return (
      principal.roles.has('warehouse') &&
      String(row.receivedById) === principal.userId
    );
  }

  /**
   * Guards the file content route. A file only becomes readable through the
   * document that owns it: an upload that has not been linked yet is a staging
   * object, and whoever holds its link still needs read access to at least one
   * owning document before the bytes are served.
   */
  public async canReadFile(
    principal: ProcurementPrincipal,
    fileId: string,
  ): Promise<boolean> {
    const links = await this.database
      .query()
      .selectFrom('procurementAttachments')
      .select(['targetType', 'targetId'])
      .where('fileId', '=', fileId)
      .execute();
    // Not linked to any document yet: nobody may read it, including another
    // signed-in user who was handed the link.
    if (links.length === 0) return false;
    for (const link of links) {
      const allowed = await this.canReadTarget(
        principal,
        String(link.targetType) as AttachmentTargetType,
        Number(link.targetId),
      );
      if (allowed) return true;
    }
    return false;
  }

  // -- Helpers -------------------------------------------------------------

  private contentUrl(id: string, ext: string): string {
    const base = this.publicBasePath.replace(/\/$/, '');
    return `${base}${PROCUREMENT_FILE_ACCESS_PATH}/${id}${ext ? `.${ext}` : ''}`;
  }

  private async nextOrderNo(prefix: 'PO' | 'GR'): Promise<string> {
    const day = isoDay(new Date()).replace(/-/g, '');
    const stem = `${prefix}-${day}-`;
    const table = prefix === 'PO' ? 'purchaseOrders' : 'goodsReceipts';
    const column = prefix === 'PO' ? 'orderNo' : 'receiptNo';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const rows = await this.database
        .query()
        .selectFrom(table)
        .select(column)
        .where(column, 'like', `${stem}%`)
        .execute();
      const candidate = `${stem}${String(rows.length + 1 + attempt).padStart(4, '0')}`;
      const existing = await this.database
        .query()
        .selectFrom(table)
        .select(column)
        .where(column, '=', candidate)
        .executeTakeFirst();
      if (!existing) return candidate;
    }
    return `${stem}${Date.now().toString().slice(-6)}`;
  }

  private async supplierNames(ids: readonly number[]) {
    const unique = [...new Set(ids)].filter((id) => Number.isFinite(id));
    if (unique.length === 0) return new Map<number, string>();
    const rows = await this.database
      .query()
      .selectFrom('suppliers')
      .select(['id', 'name'])
      .where('id', 'in', unique)
      .execute();
    return new Map(rows.map((row) => [Number(row.id), String(row.name)]));
  }

  private async materialMap(ids: readonly number[]) {
    const unique = [...new Set(ids)].filter((id) => Number.isFinite(id));
    if (unique.length === 0)
      return new Map<
        number,
        { code: string; name: string; spec: string | null; unit: string }
      >();
    const rows = await this.database
      .query()
      .selectFrom('materials')
      .selectAll()
      .where('id', 'in', unique)
      .execute();
    return new Map(
      rows.map((row) => [
        Number(row.id),
        {
          code: String(row.code),
          name: String(row.name),
          spec: asOptionalString(row.spec),
          unit: String(row.unit),
        },
      ]),
    );
  }

  private async userNames(ids: readonly string[]) {
    const unique = [...new Set(ids)].filter(Boolean);
    if (unique.length === 0) return new Map<string, string>();
    const rows = await this.database
      .query()
      .selectFrom('user')
      .select(['id', 'name', 'username'])
      .where('id', 'in', unique)
      .execute();
    return new Map(
      rows.map((row) => [
        String(row.id),
        String(row.name || row.username || row.id),
      ]),
    );
  }
}

function toIso(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function toDayString(value: unknown): string | null {
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

function asOptionalString(value: unknown): string | null {
  const text = asString(value);
  return text === '' ? null : text;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ProcurementError(
      'VALIDATION_ERROR',
      400,
      `${field} is required.`,
      {
        field,
      },
    );
  }
  return value.trim();
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function requirePositiveInt(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProcurementError(
      'VALIDATION_ERROR',
      400,
      `${field} must be a positive integer.`,
      {
        field,
      },
    );
  }
  return parsed;
}

function requirePositiveNumber(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ProcurementError(
      'VALIDATION_ERROR',
      400,
      `${field} must be greater than zero.`,
      {
        field,
      },
    );
  }
  return parsed;
}

function requireNonNegativeNumber(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ProcurementError(
      'VALIDATION_ERROR',
      400,
      `${field} must not be negative.`,
      {
        field,
      },
    );
  }
  return parsed;
}

function parseTargetType(value: unknown): AttachmentTargetType {
  if (value === 'supplier' || value === 'order' || value === 'receipt') {
    return value;
  }
  throw new ProcurementError('VALIDATION_ERROR', 400, 'Invalid target type.', {
    field: 'targetType',
  });
}

function parseCategory(
  targetType: AttachmentTargetType,
  value: unknown,
): AttachmentCategory {
  const allowed = ATTACHMENT_CATEGORIES[targetType];
  if (
    typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
  ) {
    return value as AttachmentCategory;
  }
  throw new ProcurementError(
    'INVALID_ATTACHMENT_CATEGORY',
    400,
    'Invalid attachment category.',
    {
      targetType,
      allowed,
    },
  );
}

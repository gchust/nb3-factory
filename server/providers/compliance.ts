import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** Job responsibilities understood by the application. */
export type ComplianceRole =
  'procurement' | 'quality' | 'legal' | 'supplier_contact' | 'administrator';

export const COMPLIANCE_ROLES: readonly ComplianceRole[] = [
  'procurement',
  'quality',
  'legal',
  'supplier_contact',
  'administrator',
];

/** Qualification types a supplier must hold to enter the qualified catalog. */
export const REQUIRED_QUALIFICATION_TYPES: readonly string[] = [
  'business_license',
  'quality_certification',
];

export const QUALIFICATION_TYPES: readonly string[] = [
  'business_license',
  'quality_certification',
  'environmental',
  'safety',
  'other',
];

export const FILE_CATEGORIES: readonly string[] = [
  'business_license',
  'quality_cert',
  'audit_photo',
  'contract_file',
  'bank_info',
  'rectification',
  'other',
];

export interface Membership {
  readonly organizationId: number | null;
  readonly role: ComplianceRole;
  readonly supplierId: number | null;
}

export interface AccessContext {
  readonly userId: string;
  readonly isAdmin: boolean;
  readonly memberships: readonly Membership[];
}

/**
 * The platform authorization lookup used to recognize the bootstrap administrator.
 *
 * An unrestricted authorization role (the NocoBase `root` Permission Set) is the authoritative administrator. The
 * application does not infer administrator status from the absence of a compliance membership, because that would
 * grant every newly registered account and every revoked member full access.
 */
export interface ComplianceAuthorization {
  isUnrestricted(userId: string): Promise<boolean>;
}

/** A domain failure the route layer maps to an HTTP status. */
export class ComplianceError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ComplianceError';
    this.status = status;
    this.code = code;
  }

  static forbidden(message = 'You do not have permission.') {
    return new ComplianceError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Record not found.') {
    return new ComplianceError(404, 'NOT_FOUND', message);
  }

  static badRequest(message: string, code = 'INVALID_INPUT') {
    return new ComplianceError(400, code, message);
  }
}

interface MembershipRow {
  organizationId: number | null;
  role: string;
  supplierId: number | null;
}

export interface SupplierCompliance {
  readonly eligible: boolean;
  readonly missing: readonly string[];
  readonly expired: readonly string[];
  readonly expiringSoon: readonly string[];
}

export interface SupplierSummary extends Record<string, unknown> {
  id: number;
  name: string;
  code: string;
  organizationId: number;
  organizationName: string | null;
  status: string;
  compliance: SupplierCompliance;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING_WINDOW_DAYS = 90;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(asString(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Coerce a JSON value to a string without ever falling back to `[object Object]`. */
function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return fallback;
}

function asDate(value: unknown): Date | null {
  return toDate(value);
}

function normalizeExt(filename: string): string {
  const match = /\.([^.]+)$/.exec(filename.trim());
  return match ? match[1].toLowerCase().slice(0, 32) : 'bin';
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
};

export function mimeForFile(filename: string, declared?: string): string {
  const ext = normalizeExt(filename);
  if (declared && declared !== 'application/octet-stream' && declared.trim()) {
    return declared;
  }
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

export interface CreateFileInput {
  readonly filename: string;
  readonly mimeType?: string;
  readonly category: string;
  readonly note?: string | null;
  readonly organizationId: number;
  readonly supplierId?: number | null;
  readonly contractId?: number | null;
  readonly data: Uint8Array;
}

export interface ComplianceService {
  getAccess(userId: string): Promise<AccessContext>;
  listOrganizations(context: AccessContext): Promise<Record<string, unknown>[]>;
  createOrganization(
    context: AccessContext,
    input: { name: string; code: string; description?: string },
  ): Promise<Record<string, unknown>>;
  listMembers(context: AccessContext): Promise<Record<string, unknown>[]>;
  listUsers(context: AccessContext): Promise<Record<string, unknown>[]>;
  assignMember(
    context: AccessContext,
    input: {
      userId: string;
      role: ComplianceRole;
      organizationId?: number | null;
      supplierId?: number | null;
      note?: string | null;
    },
  ): Promise<Record<string, unknown>>;
  removeMember(context: AccessContext, id: number): Promise<void>;

  listSuppliers(
    context: AccessContext,
    query: Record<string, unknown>,
  ): Promise<SupplierSummary[]>;
  getSupplier(context: AccessContext, id: number): Promise<SupplierSummary>;
  createSupplier(
    context: AccessContext,
    input: Record<string, unknown>,
  ): Promise<SupplierSummary>;
  updateSupplier(
    context: AccessContext,
    id: number,
    input: Record<string, unknown>,
  ): Promise<SupplierSummary>;
  deleteSupplier(context: AccessContext, id: number): Promise<void>;
  submitSupplier(context: AccessContext, id: number): Promise<SupplierSummary>;
  reviewSupplier(
    context: AccessContext,
    id: number,
    input: {
      decision: 'approved' | 'rejected';
      reason?: string;
      comments?: string;
      reviewYear?: number;
    },
  ): Promise<SupplierSummary>;

  listQualifications(
    context: AccessContext,
    query: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]>;
  createQualification(
    context: AccessContext,
    supplierId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  updateQualification(
    context: AccessContext,
    id: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  deleteQualification(context: AccessContext, id: number): Promise<void>;

  listReviews(
    context: AccessContext,
    query: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]>;

  listContracts(
    context: AccessContext,
    query: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]>;
  getContract(
    context: AccessContext,
    id: number,
  ): Promise<Record<string, unknown>>;
  createContract(
    context: AccessContext,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  updateContract(
    context: AccessContext,
    id: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  deleteContract(context: AccessContext, id: number): Promise<void>;

  listFiles(
    context: AccessContext,
    query: {
      supplierId?: number;
      contractId?: number;
      organizationId?: number;
    },
  ): Promise<Record<string, unknown>[]>;
  createFile(
    context: AccessContext,
    input: CreateFileInput,
  ): Promise<Record<string, unknown>>;
  updateFile(
    context: AccessContext,
    id: string,
    input: { note?: string | null; category?: string },
  ): Promise<Record<string, unknown>>;
  deleteFile(context: AccessContext, id: string): Promise<void>;
  getFileContent(
    context: AccessContext,
    id: string,
  ): Promise<{
    filename: string;
    ext: string;
    mimeType: string;
    size: number;
    data: Buffer;
  }>;

  dashboard(context: AccessContext): Promise<Record<string, unknown>>;
  risks(context: AccessContext): Promise<Record<string, unknown>>;
}

export const complianceServiceToken: ServiceToken<ComplianceService> =
  createServiceToken<ComplianceService>('app/compliance-service');

export function createComplianceService(
  database: DatabaseManager,
  authorization?: ComplianceAuthorization,
): ComplianceService {
  function query() {
    return database.query();
  }

  async function getAccess(userId: string): Promise<AccessContext> {
    const rows = (await query()
      .selectFrom('organizationMembers')
      .select(['organizationId', 'role', 'supplierId'])
      .where('userId', '=', userId)
      .execute()) as unknown as MembershipRow[];
    const memberships = rows.map((row) => ({
      organizationId: row.organizationId,
      role: row.role as ComplianceRole,
      supplierId: row.supplierId,
    }));
    // The platform unrestricted role is the administrator. A user with no membership has no access at all, and
    // revoking a membership never widens access to administrator.
    let unrestricted = false;
    if (authorization) {
      try {
        unrestricted = await authorization.isUnrestricted(userId);
      } catch {
        // Fail closed: an authorization lookup error must never grant administrator access.
        unrestricted = false;
      }
    }
    const isAdmin =
      unrestricted ||
      memberships.some((membership) => membership.role === 'administrator');
    return { userId, isAdmin, memberships };
  }

  function rolesInOrg(
    context: AccessContext,
    organizationId: number,
  ): Set<string> {
    return new Set(
      context.memberships
        .filter((membership) => membership.organizationId === organizationId)
        .map((membership) => membership.role),
    );
  }

  function supplierContactScope(context: AccessContext): number | null {
    const contact = context.memberships.find(
      (membership) =>
        membership.role === 'supplier_contact' &&
        membership.supplierId !== null,
    );
    return contact?.supplierId ?? null;
  }

  function canReadSupplier(
    context: AccessContext,
    supplier: { id: number; organizationId: number },
  ): boolean {
    if (context.isAdmin) return true;
    if (supplierContactScope(context) === supplier.id) return true;
    const roles = rolesInOrg(context, supplier.organizationId);
    return (
      roles.has('procurement') || roles.has('quality') || roles.has('legal')
    );
  }

  function canManageSupplier(
    context: AccessContext,
    organizationId: number,
  ): boolean {
    if (context.isAdmin) return true;
    return rolesInOrg(context, organizationId).has('procurement');
  }

  function canReviewSupplier(
    context: AccessContext,
    organizationId: number,
  ): boolean {
    if (context.isAdmin) return true;
    return rolesInOrg(context, organizationId).has('quality');
  }

  function canReadContract(
    context: AccessContext,
    contract: { supplierId: number; organizationId: number },
  ): boolean {
    if (context.isAdmin) return true;
    if (supplierContactScope(context) === contract.supplierId) return true;
    const roles = rolesInOrg(context, contract.organizationId);
    return (
      roles.has('procurement') || roles.has('quality') || roles.has('legal')
    );
  }

  function canManageContract(
    context: AccessContext,
    organizationId: number,
  ): boolean {
    if (context.isAdmin) return true;
    return rolesInOrg(context, organizationId).has('procurement');
  }

  async function loadSupplier(
    id: number,
  ): Promise<Record<string, unknown> | null> {
    const row = await query()
      .selectFrom('suppliers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return (row as Record<string, unknown>) ?? null;
  }

  async function loadContract(
    id: number,
  ): Promise<Record<string, unknown> | null> {
    const row = await query()
      .selectFrom('contracts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return (row as Record<string, unknown>) ?? null;
  }

  async function requireSupplier(
    context: AccessContext,
    id: number,
    write = false,
  ) {
    const supplier = await loadSupplier(id);
    if (!supplier) throw ComplianceError.notFound('Supplier not found.');
    const typed = supplier as { id: number; organizationId: number };
    const allowed = write
      ? canManageSupplier(context, typed.organizationId)
      : canReadSupplier(context, typed);
    if (!allowed)
      throw ComplianceError.forbidden('You cannot access this supplier.');
    return supplier;
  }

  async function requireContract(
    context: AccessContext,
    id: number,
    write = false,
  ) {
    const contract = await loadContract(id);
    if (!contract) throw ComplianceError.notFound('Contract not found.');
    const typed = contract as { supplierId: number; organizationId: number };
    const allowed = write
      ? canManageContract(context, typed.organizationId)
      : canReadContract(context, typed);
    if (!allowed)
      throw ComplianceError.forbidden('You cannot access this contract.');
    return contract;
  }

  /** Qualification rows are evaluated against the clock rather than a stored flag. */
  function evaluateQualification(row: Record<string, unknown>) {
    const now = Date.now();
    const expiresAt = asDate(row.expiresAt);
    const status = asString(row.status, 'active');
    if (status === 'revoked') return 'revoked';
    if (expiresAt && expiresAt.getTime() < now) return 'expired';
    return 'active';
  }

  async function evaluateSupplierCompliance(
    supplierId: number,
  ): Promise<SupplierCompliance> {
    const rows = (await query()
      .selectFrom('supplierQualifications')
      .selectAll()
      .where('supplierId', '=', supplierId)
      .execute()) as unknown as Record<string, unknown>[];
    const now = Date.now();
    const missing: string[] = [];
    const expired: string[] = [];
    const expiringSoon: string[] = [];
    for (const type of REQUIRED_QUALIFICATION_TYPES) {
      const ofType = rows.filter((row) => row.type === type);
      if (ofType.length === 0) {
        missing.push(type);
        continue;
      }
      const active = ofType.filter(
        (row) => evaluateQualification(row) === 'active',
      );
      if (active.length === 0) {
        expired.push(type);
        continue;
      }
      const soonest = active
        .map((row) => asDate(row.expiresAt))
        .filter((date): date is Date => date !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      if (soonest && soonest.getTime() - now <= EXPIRING_WINDOW_DAYS * DAY_MS) {
        expiringSoon.push(type);
      }
    }
    return {
      eligible: missing.length === 0 && expired.length === 0,
      missing,
      expired,
      expiringSoon,
    };
  }

  function organizationScopedFilter(
    context: AccessContext,
    column = 'organizationId',
  ) {
    // Unrestricted roles (procurement/quality/legal) can read any organization they belong to.
    const unrestricted = context.isAdmin
      ? null
      : context.memberships
          .filter((m) => m.role !== 'supplier_contact')
          .map((m) => m.organizationId)
          .filter((id): id is number => id !== null);
    if (context.isAdmin) return null;
    if (unrestricted && unrestricted.length > 0)
      return { column, values: Array.from(new Set(unrestricted)) };
    return { column, values: [] as number[] };
  }

  async function attachOrganizationNames(
    rows: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    if (rows.length === 0) return rows;
    const ids = Array.from(
      new Set(
        rows
          .map((row) => Number(row.organizationId))
          .filter((id) => Number.isFinite(id)),
      ),
    );
    const orgs = (await query()
      .selectFrom('procurementOrganizations')
      .select(['id', 'name'])
      .where('id', 'in', ids)
      .execute()) as unknown as { id: number; name: string }[];
    const byId = new Map(orgs.map((org) => [org.id, org.name]));
    return rows.map((row) => ({
      ...row,
      organizationName: byId.get(Number(row.organizationId)) ?? null,
    }));
  }

  return {
    getAccess,

    async listOrganizations(context) {
      let builder = query()
        .selectFrom('procurementOrganizations')
        .selectAll()
        .orderBy('code', 'asc');
      if (!context.isAdmin) {
        const ids = context.memberships
          .map((membership) => membership.organizationId)
          .filter((id): id is number => id !== null);
        if (ids.length === 0) return [];
        builder = builder.where('id', 'in', Array.from(new Set(ids)));
      }
      return await builder.execute();
    },

    async createOrganization(context, input) {
      if (!context.isAdmin)
        throw ComplianceError.forbidden(
          'Only administrators manage organizations.',
        );
      if (!input.name?.trim() || !input.code?.trim()) {
        throw ComplianceError.badRequest(
          'Organization name and code are required.',
        );
      }
      const existing = await query()
        .selectFrom('procurementOrganizations')
        .select('id')
        .where('code', '=', input.code.trim())
        .executeTakeFirst();
      if (existing)
        throw ComplianceError.badRequest(
          'Organization code already exists.',
          'DUPLICATE',
        );
      const now = new Date();
      const inserted = await query()
        .insertInto('procurementOrganizations')
        .values({
          name: input.name.trim(),
          code: input.code.trim(),
          description: input.description ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return {
        id: Number(inserted.insertId),
        name: input.name.trim(),
        code: input.code.trim(),
      };
    },

    async listMembers(context) {
      if (!context.isAdmin)
        throw ComplianceError.forbidden(
          'Only administrators manage role assignments.',
        );
      const rows = (await query()
        .selectFrom('organizationMembers')
        .selectAll()
        .orderBy('id', 'asc')
        .execute()) as unknown as Record<string, unknown>[];
      const enriched = await attachOrganizationNames(rows);
      return attachUserNames(enriched);
    },

    async listUsers(context) {
      if (!context.isAdmin)
        throw ComplianceError.forbidden('Only administrators list users.');
      const rows = (await query()
        .selectFrom('user')
        .select(['id', 'name', 'username', 'email'])
        .orderBy('id', 'asc')
        .execute()) as unknown as Record<string, unknown>[];
      return rows;
    },

    async assignMember(context, input) {
      if (!context.isAdmin)
        throw ComplianceError.forbidden(
          'Only administrators manage role assignments.',
        );
      if (!input.userId?.trim())
        throw ComplianceError.badRequest('A user is required.');
      if (!COMPLIANCE_ROLES.includes(input.role))
        throw ComplianceError.badRequest('Unknown role.');
      if (input.role === 'supplier_contact' && !input.supplierId) {
        throw ComplianceError.badRequest(
          'A supplier contact membership must name a supplier.',
          'SUPPLIER_REQUIRED',
        );
      }
      if (
        input.role !== 'administrator' &&
        input.role !== 'supplier_contact' &&
        !input.organizationId
      ) {
        throw ComplianceError.badRequest(
          'Select a procurement organization.',
          'ORGANIZATION_REQUIRED',
        );
      }
      const now = new Date();
      const inserted = await query()
        .insertInto('organizationMembers')
        .values({
          userId: input.userId.trim(),
          role: input.role,
          organizationId: input.organizationId ?? null,
          supplierId: input.supplierId ?? null,
          note: input.note ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return { id: Number(inserted.insertId) };
    },

    async removeMember(context, id) {
      if (!context.isAdmin)
        throw ComplianceError.forbidden(
          'Only administrators manage role assignments.',
        );
      await query()
        .deleteFrom('organizationMembers')
        .where('id', '=', id)
        .execute();
    },

    async listSuppliers(context, filters) {
      let builder = query().selectFrom('suppliers').selectAll();
      const scope = organizationScopedFilter(context);
      const contactSupplierId = context.isAdmin
        ? null
        : supplierContactScope(context);
      if (contactSupplierId !== null) {
        builder = builder.where('id', '=', contactSupplierId);
      } else if (scope) {
        if (scope.values.length === 0) return [];
        builder = builder.where('organizationId', 'in', scope.values);
      }
      if (typeof filters.status === 'string' && filters.status) {
        builder = builder.where('status', '=', filters.status);
      }
      if (typeof filters.organizationId === 'number') {
        builder = builder.where('organizationId', '=', filters.organizationId);
      }
      if (typeof filters.search === 'string' && filters.search.trim()) {
        const term = `%${filters.search.trim()}%`;
        builder = builder.where((eb) =>
          eb.or([eb('name', 'like', term), eb('code', 'like', term)]),
        );
      }
      const rows = (await builder
        .orderBy('code', 'asc')
        .execute()) as unknown as Record<string, unknown>[];
      const enriched = await attachOrganizationNames(rows);
      const results: SupplierSummary[] = [];
      for (const row of enriched) {
        const compliance = await evaluateSupplierCompliance(Number(row.id));
        results.push({ ...(row as object), compliance } as SupplierSummary);
      }
      return results;
    },

    async getSupplier(context, id) {
      const supplier = await requireSupplier(context, id);
      const [enriched] = await attachOrganizationNames([supplier]);
      const compliance = await evaluateSupplierCompliance(id);
      return { ...(enriched as object), compliance } as SupplierSummary;
    },

    async createSupplier(context, input) {
      const organizationId = Number(input.organizationId);
      if (!Number.isFinite(organizationId))
        throw ComplianceError.badRequest(
          'A procurement organization is required.',
        );
      if (!canManageSupplier(context, organizationId))
        throw ComplianceError.forbidden(
          'You cannot create suppliers for this organization.',
        );
      const name = asString(input.name).trim();
      const code = asString(input.code).trim();
      if (!name || !code)
        throw ComplianceError.badRequest(
          'Supplier name and code are required.',
        );
      const existing = await query()
        .selectFrom('suppliers')
        .select('id')
        .where('code', '=', code)
        .executeTakeFirst();
      if (existing)
        throw ComplianceError.badRequest(
          'Supplier code already exists.',
          'DUPLICATE',
        );
      const now = new Date();
      const inserted = await query()
        .insertInto('suppliers')
        .values({
          organizationId,
          name,
          code,
          category: input.category ?? null,
          contactName: input.contactName ?? null,
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          status: 'draft',
          businessScope: input.businessScope ?? null,
          notes: input.notes ?? null,
          createdById: context.userId,
          updatedById: context.userId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return this.getSupplier(context, Number(inserted.insertId));
    },

    async updateSupplier(context, id, input) {
      const supplier = await requireSupplier(context, id, true);
      const patch: Record<string, unknown> = {
        updatedAt: new Date(),
        updatedById: context.userId,
      };
      for (const field of [
        'name',
        'category',
        'contactName',
        'contactEmail',
        'contactPhone',
        'businessScope',
        'notes',
      ]) {
        if (field in input) patch[field] = input[field];
      }
      if ('status' in input) {
        const nextStatus = String(input.status);
        if (nextStatus === 'qualified') {
          throw ComplianceError.badRequest(
            'Supplier status is decided by a quality review.',
            'STATUS_MANAGED_BY_REVIEW',
          );
        }
        if (!['draft', 'pending_review', 'suspended'].includes(nextStatus)) {
          throw ComplianceError.badRequest('Unsupported supplier status.');
        }
        patch.status = nextStatus;
      }
      await query()
        .updateTable('suppliers')
        .set(patch)
        .where('id', '=', Number(supplier.id))
        .execute();
      return this.getSupplier(context, id);
    },

    async deleteSupplier(context, id) {
      const supplier = await requireSupplier(context, id, true);
      const supplierId = Number(supplier.id);
      await database.transaction(async (connection) => {
        const q = connection.query;
        await q
          .deleteFrom('complianceFiles')
          .where('supplierId', '=', supplierId)
          .execute();
        await q
          .deleteFrom('supplierReviews')
          .where('supplierId', '=', supplierId)
          .execute();
        await q
          .deleteFrom('supplierQualifications')
          .where('supplierId', '=', supplierId)
          .execute();
        await q
          .deleteFrom('contracts')
          .where('supplierId', '=', supplierId)
          .execute();
        await q.deleteFrom('suppliers').where('id', '=', supplierId).execute();
      });
    },

    async submitSupplier(context, id) {
      const supplier = await requireSupplier(context, id, true);
      if (String(supplier.status) === 'qualified') {
        throw ComplianceError.badRequest(
          'An already qualified supplier does not need another submission.',
        );
      }
      await query()
        .updateTable('suppliers')
        .set({
          status: 'pending_review',
          updatedAt: new Date(),
          updatedById: context.userId,
        })
        .where('id', '=', id)
        .execute();
      return this.getSupplier(context, id);
    },

    async reviewSupplier(context, id, input) {
      const supplier = await requireSupplier(context, id, false);
      const organizationId = Number(supplier.organizationId);
      if (!canReviewSupplier(context, organizationId)) {
        throw ComplianceError.forbidden(
          'Only a quality lead may review qualifications.',
        );
      }
      if (input.decision !== 'approved' && input.decision !== 'rejected') {
        throw ComplianceError.badRequest(
          'Decision must be approved or rejected.',
        );
      }
      if (input.decision === 'rejected' && !String(input.reason ?? '').trim()) {
        throw ComplianceError.badRequest(
          'A rejection reason is required.',
          'REASON_REQUIRED',
        );
      }
      const compliance = await evaluateSupplierCompliance(id);
      if (input.decision === 'approved' && !compliance.eligible) {
        throw ComplianceError.badRequest(
          'Expired or missing qualifications prevent qualification.',
          'INELIGIBLE',
        );
      }
      const now = new Date();
      const reviewYear = Number.isFinite(input.reviewYear)
        ? Number(input.reviewYear)
        : now.getFullYear();
      await database.transaction(async (connection) => {
        const q = connection.query;
        await q
          .insertInto('supplierReviews')
          .values({
            supplierId: id,
            organizationId,
            reviewerId: context.userId,
            reviewYear,
            decision: input.decision,
            reason:
              input.decision === 'rejected'
                ? String(input.reason).trim()
                : null,
            comments: input.comments ?? null,
            reviewedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        await q
          .updateTable('suppliers')
          .set({
            status: input.decision === 'approved' ? 'qualified' : 'rejected',
            updatedAt: now,
            updatedById: context.userId,
          })
          .where('id', '=', id)
          .execute();
      });
      return this.getSupplier(context, id);
    },

    async listQualifications(context, filters) {
      let builder = query().selectFrom('supplierQualifications').selectAll();
      const scope = organizationScopedFilter(context);
      const contactSupplierId = context.isAdmin
        ? null
        : supplierContactScope(context);
      if (contactSupplierId !== null) {
        builder = builder.where('supplierId', '=', contactSupplierId);
      } else if (scope) {
        if (scope.values.length === 0) return [];
        builder = builder.where('organizationId', 'in', scope.values);
      }
      if (typeof filters.supplierId === 'number')
        builder = builder.where('supplierId', '=', filters.supplierId);
      if (typeof filters.type === 'string' && filters.type)
        builder = builder.where('type', '=', filters.type);
      const rows = (await builder
        .orderBy('expiresAt', 'asc')
        .execute()) as unknown as Record<string, unknown>[];
      const enriched = await attachSupplierNames(rows);
      return enriched.map((row) => ({
        ...row,
        effectiveStatus: evaluateQualification(row),
      }));
    },

    async createQualification(context, supplierId, input) {
      const supplier = await requireSupplier(context, supplierId, true);
      const type = asString(input.type).trim();
      if (!QUALIFICATION_TYPES.includes(type))
        throw ComplianceError.badRequest('Unknown qualification type.');
      const now = new Date();
      const inserted = await query()
        .insertInto('supplierQualifications')
        .values({
          supplierId,
          organizationId: Number(supplier.organizationId),
          type,
          certificateNo: input.certificateNo ?? null,
          issuer: input.issuer ?? null,
          issuedAt: input.issuedAt ? new Date(asString(input.issuedAt)) : null,
          expiresAt: input.expiresAt
            ? new Date(asString(input.expiresAt))
            : null,
          status: 'active',
          notes: input.notes ?? null,
          createdById: context.userId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return (await query()
        .selectFrom('supplierQualifications')
        .selectAll()
        .where('id', '=', Number(inserted.insertId))
        .executeTakeFirst()) as unknown as Record<string, unknown>;
    },

    async updateQualification(context, id, input) {
      const row = await query()
        .selectFrom('supplierQualifications')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw ComplianceError.notFound('Qualification not found.');
      await requireSupplier(
        context,
        Number((row as Record<string, unknown>).supplierId),
        true,
      );
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const field of ['certificateNo', 'issuer', 'notes']) {
        if (field in input) patch[field] = input[field];
      }
      if ('status' in input) patch.status = input.status;
      if ('issuedAt' in input)
        patch.issuedAt = input.issuedAt
          ? new Date(asString(input.issuedAt))
          : null;
      if ('expiresAt' in input)
        patch.expiresAt = input.expiresAt
          ? new Date(asString(input.expiresAt))
          : null;
      await query()
        .updateTable('supplierQualifications')
        .set(patch)
        .where('id', '=', id)
        .execute();
      return (await query()
        .selectFrom('supplierQualifications')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst()) as unknown as Record<string, unknown>;
    },

    async deleteQualification(context, id) {
      const row = await query()
        .selectFrom('supplierQualifications')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw ComplianceError.notFound('Qualification not found.');
      await requireSupplier(
        context,
        Number((row as Record<string, unknown>).supplierId),
        true,
      );
      await query()
        .deleteFrom('supplierQualifications')
        .where('id', '=', id)
        .execute();
    },

    async listReviews(context, filters) {
      let builder = query().selectFrom('supplierReviews').selectAll();
      const scope = organizationScopedFilter(context);
      const contactSupplierId = context.isAdmin
        ? null
        : supplierContactScope(context);
      if (contactSupplierId !== null) {
        builder = builder.where('supplierId', '=', contactSupplierId);
      } else if (scope) {
        if (scope.values.length === 0) return [];
        builder = builder.where('organizationId', 'in', scope.values);
      }
      if (typeof filters.supplierId === 'number')
        builder = builder.where('supplierId', '=', filters.supplierId);
      const rows = (await builder
        .orderBy('reviewedAt', 'desc')
        .execute()) as unknown as Record<string, unknown>[];
      const enriched = await attachOrganizationNames(rows);
      const withSuppliers = await attachSupplierNames(enriched);
      return attachUserNames(withSuppliers, 'reviewerId', 'reviewerName');
    },

    async listContracts(context, filters) {
      let builder = query().selectFrom('contracts').selectAll();
      const scope = organizationScopedFilter(context);
      const contactSupplierId = context.isAdmin
        ? null
        : supplierContactScope(context);
      if (contactSupplierId !== null) {
        builder = builder.where('supplierId', '=', contactSupplierId);
      } else if (scope) {
        if (scope.values.length === 0) return [];
        builder = builder.where('organizationId', 'in', scope.values);
      }
      if (typeof filters.status === 'string' && filters.status)
        builder = builder.where('status', '=', filters.status);
      if (typeof filters.supplierId === 'number')
        builder = builder.where('supplierId', '=', filters.supplierId);
      const rows = (await builder
        .orderBy('endDate', 'asc')
        .execute()) as unknown as Record<string, unknown>[];
      const enriched = await attachOrganizationNames(rows);
      return attachSupplierNames(enriched);
    },

    async getContract(context, id) {
      const contract = await requireContract(context, id);
      const [enriched] = await attachOrganizationNames([contract]);
      const [withSupplier] = await attachSupplierNames([enriched]);
      return withSupplier;
    },

    async createContract(context, input) {
      const supplierId = Number(input.supplierId);
      if (!Number.isFinite(supplierId))
        throw ComplianceError.badRequest('A supplier is required.');
      const supplier = await loadSupplier(supplierId);
      if (!supplier) throw ComplianceError.badRequest('Supplier not found.');
      const organizationId = Number(supplier.organizationId);
      if (!canManageContract(context, organizationId))
        throw ComplianceError.forbidden(
          'You cannot create contracts for this organization.',
        );
      const contractNo = asString(input.contractNo).trim();
      const title = asString(input.title).trim();
      if (!contractNo || !title)
        throw ComplianceError.badRequest(
          'Contract number and title are required.',
        );
      const existing = await query()
        .selectFrom('contracts')
        .select('id')
        .where('contractNo', '=', contractNo)
        .executeTakeFirst();
      if (existing)
        throw ComplianceError.badRequest(
          'Contract number already exists.',
          'DUPLICATE',
        );
      const now = new Date();
      const inserted = await query()
        .insertInto('contracts')
        .values({
          organizationId,
          supplierId,
          contractNo,
          title,
          signedAt: input.signedAt ? new Date(asString(input.signedAt)) : null,
          startDate: input.startDate
            ? new Date(asString(input.startDate))
            : null,
          endDate: input.endDate ? new Date(asString(input.endDate)) : null,
          amount: input.amount ?? null,
          currency: input.currency ?? 'CNY',
          status: input.status ?? 'active',
          legalNotes: input.legalNotes ?? null,
          createdById: context.userId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return this.getContract(context, Number(inserted.insertId));
    },

    async updateContract(context, id, input) {
      await requireContract(context, id, true);
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const field of ['title', 'currency', 'status', 'legalNotes']) {
        if (field in input) patch[field] = input[field];
      }
      if ('amount' in input) patch.amount = input.amount;
      for (const field of ['signedAt', 'startDate', 'endDate']) {
        if (field in input)
          patch[field] = input[field] ? new Date(asString(input[field])) : null;
      }
      await query()
        .updateTable('contracts')
        .set(patch)
        .where('id', '=', id)
        .execute();
      return this.getContract(context, id);
    },

    async deleteContract(context, id) {
      await requireContract(context, id, true);
      await database.transaction(async (connection) => {
        const q = connection.query;
        await q
          .deleteFrom('complianceFiles')
          .where('contractId', '=', id)
          .execute();
        await q.deleteFrom('contracts').where('id', '=', id).execute();
      });
    },

    async listFiles(context, filters) {
      let builder = query()
        .selectFrom('complianceFiles')
        .select([
          'id',
          'filename',
          'ext',
          'mimeType',
          'size',
          'organizationId',
          'supplierId',
          'contractId',
          'category',
          'note',
          'uploadedById',
          'createdAt',
          'updatedAt',
        ]);
      const scope = organizationScopedFilter(context);
      const contactSupplierId = context.isAdmin
        ? null
        : supplierContactScope(context);
      if (contactSupplierId !== null) {
        builder = builder.where('supplierId', '=', contactSupplierId);
      } else if (scope) {
        if (scope.values.length === 0) return [];
        builder = builder.where('organizationId', 'in', scope.values);
      }
      if (typeof filters.supplierId === 'number')
        builder = builder.where('supplierId', '=', filters.supplierId);
      if (typeof filters.contractId === 'number')
        builder = builder.where('contractId', '=', filters.contractId);
      if (typeof filters.organizationId === 'number')
        builder = builder.where('organizationId', '=', filters.organizationId);
      const rows = (await builder
        .orderBy('createdAt', 'desc')
        .execute()) as unknown as Record<string, unknown>[];
      return attachUserNames(rows, 'uploadedById', 'uploadedByName');
    },

    async createFile(context, input) {
      const supplierId = input.supplierId ?? null;
      const contractId = input.contractId ?? null;
      if (!supplierId && !contractId) {
        throw ComplianceError.badRequest(
          'A file must belong to a supplier or a contract.',
          'ASSOCIATION_REQUIRED',
        );
      }
      if (supplierId) {
        await requireSupplier(context, supplierId, true);
      }
      if (contractId) {
        await requireContract(context, contractId, true);
      }
      if (!canManageSupplier(context, input.organizationId)) {
        throw ComplianceError.forbidden(
          'You cannot add files to this organization.',
        );
      }
      if (!FILE_CATEGORIES.includes(input.category))
        throw ComplianceError.badRequest('Unknown file category.');
      const bytes = Buffer.from(input.data);
      if (bytes.length === 0)
        throw ComplianceError.badRequest('The uploaded file is empty.');
      if (bytes.length > MAX_FILE_BYTES)
        throw ComplianceError.badRequest(
          'The uploaded file is larger than 20 MB.',
          'FILE_TOO_LARGE',
        );
      const filename = input.filename.trim() || 'unnamed';
      const ext = normalizeExt(filename);
      const now = new Date();
      const id = crypto.randomUUID();
      await query()
        .insertInto('complianceFiles')
        .values({
          id,
          filename,
          ext,
          mimeType: mimeForFile(filename, input.mimeType),
          size: bytes.length,
          data: bytes,
          organizationId: input.organizationId,
          supplierId,
          contractId,
          category: input.category,
          note: input.note ?? null,
          uploadedById: context.userId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const created = await query()
        .selectFrom('complianceFiles')
        .select([
          'id',
          'filename',
          'ext',
          'mimeType',
          'size',
          'organizationId',
          'supplierId',
          'contractId',
          'category',
          'note',
          'uploadedById',
          'createdAt',
          'updatedAt',
        ])
        .where('id', '=', id)
        .executeTakeFirst();
      const [enriched] = await attachUserNames(
        [created as Record<string, unknown>],
        'uploadedById',
        'uploadedByName',
      );
      return enriched;
    },

    async updateFile(context, id, input) {
      const row = await query()
        .selectFrom('complianceFiles')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw ComplianceError.notFound('File not found.');
      const typed = row as Record<string, unknown>;
      await ensureFileManage(context, typed);
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if ('note' in input) patch.note = input.note ?? null;
      if ('category' in input) {
        if (!FILE_CATEGORIES.includes(String(input.category)))
          throw ComplianceError.badRequest('Unknown file category.');
        patch.category = input.category;
      }
      await query()
        .updateTable('complianceFiles')
        .set(patch)
        .where('id', '=', id)
        .execute();
      const updated = await query()
        .selectFrom('complianceFiles')
        .select([
          'id',
          'filename',
          'ext',
          'mimeType',
          'size',
          'organizationId',
          'supplierId',
          'contractId',
          'category',
          'note',
          'uploadedById',
          'createdAt',
          'updatedAt',
        ])
        .where('id', '=', id)
        .executeTakeFirst();
      const [enriched] = await attachUserNames(
        [updated as Record<string, unknown>],
        'uploadedById',
        'uploadedByName',
      );
      return enriched;
    },

    async deleteFile(context, id) {
      const row = await query()
        .selectFrom('complianceFiles')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw ComplianceError.notFound('File not found.');
      await ensureFileManage(context, row);
      await query()
        .deleteFrom('complianceFiles')
        .where('id', '=', id)
        .execute();
    },

    async getFileContent(context, id) {
      const row = await query()
        .selectFrom('complianceFiles')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw ComplianceError.notFound('File not found.');
      const typed = row as Record<string, unknown>;
      await ensureFileRead(context, typed);
      const raw = typed.data;
      const data =
        raw instanceof Uint8Array
          ? Buffer.from(raw)
          : Buffer.from(asString(raw), 'binary');
      return {
        filename: String(typed.filename),
        ext: String(typed.ext),
        mimeType: String(typed.mimeType),
        size: Number(typed.size),
        data,
      };
    },

    async dashboard(context) {
      const suppliers = await this.listSuppliers(context, {});
      const contracts = await this.listContracts(context, {});
      const qualifications = await this.listQualifications(context, {});
      const now = Date.now();
      const threshold = now + EXPIRING_WINDOW_DAYS * DAY_MS;
      let expired = 0;
      let expiring = 0;
      for (const row of qualifications) {
        const date = asDate(row.expiresAt);
        if (!date) continue;
        if (date.getTime() < now) expired += 1;
        else if (date.getTime() <= threshold) expiring += 1;
      }
      const activeContracts = contracts.filter(
        (contract) => String(contract.status) === 'active',
      );
      const contractExpiring = activeContracts.filter((contract) => {
        const date = asDate(contract.endDate);
        return date !== null && date.getTime() <= threshold;
      });
      const byStatus: Record<string, number> = {};
      for (const supplier of suppliers) {
        const status = String(supplier.status);
        byStatus[status] = (byStatus[status] ?? 0) + 1;
      }
      return {
        totals: {
          suppliers: suppliers.length,
          qualified: suppliers.filter(
            (s) => s.compliance.eligible && String(s.status) === 'qualified',
          ).length,
          pendingReview: byStatus.pending_review ?? 0,
          rejected: byStatus.rejected ?? 0,
          contracts: contracts.length,
          activeContracts: activeContracts.length,
        },
        risk: {
          expiredQualifications: expired,
          expiringQualifications: expiring,
          expiringContracts: contractExpiring.length,
          ineligibleQualifiedSuppliers: suppliers.filter(
            (s) => String(s.status) === 'qualified' && !s.compliance.eligible,
          ).length,
        },
        byStatus,
      };
    },

    async risks(context) {
      const now = Date.now();
      const threshold = now + EXPIRING_WINDOW_DAYS * DAY_MS;
      const qualifications = await this.listQualifications(context, {});
      const contracts = await this.listContracts(context, {});
      const suppliers = await this.listSuppliers(context, {});
      const supplierById = new Map(
        suppliers.map((supplier) => [supplier.id, supplier]),
      );
      const qualificationRisks = qualifications
        .map((row) => {
          const date = asDate(row.expiresAt);
          if (!date) return null;
          const supplier = supplierById.get(Number(row.supplierId));
          if (date.getTime() < now) {
            return {
              kind: 'qualification_expired',
              severity: 'high',
              supplierId: row.supplierId,
              supplierName: supplier?.name ?? '',
              type: row.type,
              date: date.toISOString(),
            };
          }
          if (date.getTime() <= threshold) {
            return {
              kind: 'qualification_expiring',
              severity: 'medium',
              supplierId: row.supplierId,
              supplierName: supplier?.name ?? '',
              type: row.type,
              date: date.toISOString(),
            };
          }
          return null;
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
      const contractRisks = contracts
        .map((row) => {
          const date = asDate(row.endDate);
          if (!date) return null;
          const status = String(row.status);
          if (status === 'terminated') return null;
          const supplier = supplierById.get(Number(row.supplierId));
          if (date.getTime() < now) {
            return {
              kind: 'contract_expired',
              severity: 'high',
              contractId: row.id,
              contractNo: row.contractNo,
              supplierName: supplier?.name ?? '',
              date: date.toISOString(),
            };
          }
          if (status === 'active' && date.getTime() <= threshold) {
            return {
              kind: 'contract_expiring',
              severity: 'medium',
              contractId: row.id,
              contractNo: row.contractNo,
              supplierName: supplier?.name ?? '',
              date: date.toISOString(),
            };
          }
          return null;
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
      const eligibilityRisks = suppliers
        .filter(
          (supplier) =>
            String(supplier.status) === 'qualified' &&
            !supplier.compliance.eligible,
        )
        .map((supplier) => ({
          kind: 'ineligible_qualified_supplier',
          severity: 'high',
          supplierId: supplier.id,
          supplierName: supplier.name,
          missing: supplier.compliance.missing,
          expired: supplier.compliance.expired,
        }));
      return {
        qualifications: qualificationRisks,
        contracts: contractRisks,
        eligibility: eligibilityRisks,
      };
    },
  };

  async function ensureFileRead(
    context: AccessContext,
    file: Record<string, unknown>,
  ) {
    if (file.supplierId) {
      const supplier = await loadSupplier(Number(file.supplierId));
      if (!supplier) throw ComplianceError.notFound('File not found.');
      if (
        !canReadSupplier(
          context,
          supplier as { id: number; organizationId: number },
        )
      ) {
        throw ComplianceError.forbidden('You cannot access this file.');
      }
      return;
    }
    if (file.contractId) {
      const contract = await loadContract(Number(file.contractId));
      if (!contract) throw ComplianceError.notFound('File not found.');
      if (
        !canReadContract(
          context,
          contract as { supplierId: number; organizationId: number },
        )
      ) {
        throw ComplianceError.forbidden('You cannot access this file.');
      }
      return;
    }
    if (context.isAdmin || String(file.uploadedById) === context.userId) return;
    throw ComplianceError.forbidden('You cannot access this file.');
  }

  async function ensureFileManage(
    context: AccessContext,
    file: Record<string, unknown>,
  ) {
    if (context.isAdmin) return;
    if (file.supplierId) {
      const supplier = await loadSupplier(Number(file.supplierId));
      if (
        supplier &&
        canManageSupplier(context, Number(supplier.organizationId))
      )
        return;
    }
    if (file.contractId) {
      const contract = await loadContract(Number(file.contractId));
      if (
        contract &&
        canManageContract(context, Number(contract.organizationId))
      )
        return;
    }
    throw ComplianceError.forbidden('You cannot manage this file.');
  }

  async function attachSupplierNames(
    rows: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    if (rows.length === 0) return rows;
    const ids = Array.from(
      new Set(
        rows
          .map((row) => Number(row.supplierId))
          .filter((id) => Number.isFinite(id)),
      ),
    );
    if (ids.length === 0) return rows;
    const suppliers = (await query()
      .selectFrom('suppliers')
      .select(['id', 'name'])
      .where('id', 'in', ids)
      .execute()) as unknown as { id: number; name: string }[];
    const byId = new Map(
      suppliers.map((supplier) => [supplier.id, supplier.name]),
    );
    return rows.map((row) => ({
      ...row,
      supplierName: byId.get(Number(row.supplierId)) ?? null,
    }));
  }

  async function attachUserNames(
    rows: Record<string, unknown>[],
    idField = 'userId',
    nameField = 'userName',
  ): Promise<Record<string, unknown>[]> {
    if (rows.length === 0) return rows;
    const ids = Array.from(
      new Set(rows.map((row) => asString(row[idField])).filter(Boolean)),
    );
    if (ids.length === 0) return rows;
    const users = (await query()
      .selectFrom('user')
      .select(['id', 'name', 'username'])
      .where('id', 'in', ids)
      .execute()) as unknown as {
      id: string;
      name: string;
      username: string | null;
    }[];
    const byId = new Map(
      users.map((user) => [user.id, user.name || user.username || user.id]),
    );
    return rows.map((row) => ({
      ...row,
      [nameField]: byId.get(asString(row[idField])) ?? null,
    }));
  }
}

export default class ComplianceProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/compliance-provider';

  public override register(): void {
    this.app.container.singleton(complianceServiceToken, () =>
      createComplianceService(
        this.app.container.resolve(databaseManagerToken),
        {
          // Resolve the platform authorization service lazily so provider registration order does not matter.
          isUnrestricted: async (userId) => {
            const authorization =
              this.app.container.resolve(authorizationToken);
            return authorization.permissionSets.unrestricted({
              principal: { type: 'user', id: userId },
            });
          },
        },
      ),
    );
  }
}

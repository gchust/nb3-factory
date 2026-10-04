import type { DatabaseManager, Repository } from '@nocobase/db';

import type { ServiceActor } from './access.js';
import { hasRole, isManager } from './access.js';
import type { Customer, Device, KnowledgeArticle } from './domain.js';
import {
  ServiceConflictError,
  ServiceForbiddenError,
  ServiceNotFoundError,
  ServiceValidationError,
} from './errors.js';
import { visibleCustomerIds, visibleDeviceIds } from './visibility.js';

export interface ListQuery {
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface CustomerInput {
  readonly code?: string;
  readonly name?: string;
  readonly contact?: string | null;
  readonly phone?: string | null;
  readonly level?: string;
  readonly region?: string | null;
}

export interface DeviceInput {
  readonly deviceNo?: string;
  readonly model?: string;
  readonly serialNo?: string | null;
  readonly customerId?: number | null;
  readonly status?: string;
  readonly installedAt?: string | null;
  readonly warrantyUntil?: string | null;
  readonly nextInspectionAt?: string | null;
  readonly location?: string | null;
  readonly notes?: string | null;
}

export interface KnowledgeInput {
  readonly title?: string;
  readonly category?: string | null;
  readonly deviceModel?: string | null;
  readonly tags?: string | null;
  readonly status?: string;
  readonly summary?: string | null;
  readonly content?: string;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/** A device row with its owning customer's label for list screens. */
export type DeviceView = Device & { readonly customerName: string | null };

export interface CatalogService {
  listCustomers(query: ListQuery, actor: ServiceActor): Promise<Page<Customer>>;
  getCustomer(id: number, actor: ServiceActor): Promise<Customer>;
  createCustomer(input: CustomerInput, actor: ServiceActor): Promise<Customer>;
  updateCustomer(
    id: number,
    input: CustomerInput,
    actor: ServiceActor,
  ): Promise<Customer>;
  listDevices(query: ListQuery, actor: ServiceActor): Promise<Page<DeviceView>>;
  getDevice(id: number, actor: ServiceActor): Promise<Device>;
  createDevice(input: DeviceInput, actor: ServiceActor): Promise<Device>;
  updateDevice(
    id: number,
    input: DeviceInput,
    actor: ServiceActor,
  ): Promise<Device>;
  listKnowledge(
    query: ListQuery,
    actor: ServiceActor,
  ): Promise<Page<KnowledgeArticle>>;
  getKnowledge(id: number, actor: ServiceActor): Promise<KnowledgeArticle>;
  createKnowledge(
    input: KnowledgeInput,
    actor: ServiceActor,
  ): Promise<KnowledgeArticle>;
  updateKnowledge(
    id: number,
    input: KnowledgeInput,
    actor: ServiceActor,
  ): Promise<KnowledgeArticle>;
  deleteKnowledge(id: number, actor: ServiceActor): Promise<void>;
}

function requireManager(actor: ServiceActor, operation: string): void {
  if (!isManager(actor)) {
    throw new ServiceForbiddenError(
      `Only a supervisor may ${operation} the service ledger`,
    );
  }
}

export function paginate<T>(rows: readonly T[], query: ListQuery): Page<T> {
  const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 200);
  const page = Math.max(query.page ?? 1, 1);
  const start = (page - 1) * pageSize;
  return {
    items: rows.slice(start, start + pageSize),
    total: rows.length,
    page,
    pageSize,
  };
}

export function readPage(query: Record<string, unknown>): ListQuery {
  const number = (value: unknown): number | undefined => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };
  return {
    search:
      typeof query.search === 'string' && query.search
        ? query.search
        : undefined,
    page: number(query.page),
    pageSize: number(query.pageSize),
  };
}

/**
 * A date input submits `YYYY-MM-DD`, while the collection fields are
 * `datetime`. Normalizing here keeps both the browser form and a direct API
 * call working instead of failing the repository's temporal validation. A
 * date-only value is anchored at UTC midnight so it round-trips unchanged
 * through the date inputs that read it back.
 */
function normalizeTemporal(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00.000Z`;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function idSet(
  visibility:
    | { kind: 'all' }
    | { kind: 'none' }
    | { kind: 'ids'; ids: readonly number[] },
): 'all' | ReadonlySet<number> {
  if (visibility.kind === 'all') return 'all';
  if (visibility.kind === 'none') return new Set<number>();
  return new Set(visibility.ids);
}

export function createCatalogService(
  database: DatabaseManager,
): CatalogService {
  const customers = (): Repository<Customer> =>
    database.repository<Customer>('customers');
  const devices = (): Repository<Device> =>
    database.repository<Device>('devices');
  const articles = (): Repository<KnowledgeArticle> =>
    database.repository<KnowledgeArticle>('knowledge_articles');

  async function visibleCustomers(actor: ServiceActor) {
    return idSet(await visibleCustomerIds(database, actor));
  }

  async function visibleDevices(actor: ServiceActor) {
    return idSet(await visibleDeviceIds(database, actor));
  }

  async function attachCustomerNames(
    rows: readonly Device[],
  ): Promise<DeviceView[]> {
    if (rows.length === 0) return [];
    const ids = new Set<number>();
    for (const row of rows) if (row.customerId != null) ids.add(row.customerId);
    const all = (await customers().findMany()) ?? [];
    const byId = new Map(
      all.filter((row) => ids.has(row.id)).map((row) => [row.id, row]),
    );
    return rows.map((row) => ({
      ...row,
      customerName:
        row.customerId != null
          ? (byId.get(row.customerId)?.name ?? null)
          : null,
    }));
  }

  async function requireCustomer(id: number): Promise<Customer> {
    const customer = await customers().findOne({ filter: { id } });
    if (!customer) throw new ServiceNotFoundError('Customer not found');
    return customer;
  }

  return {
    async listCustomers(query, actor) {
      const scope = await visibleCustomers(actor);
      if (scope !== 'all' && scope.size === 0) {
        return { items: [], total: 0, page: 1, pageSize: 0 };
      }
      const search = query.search?.toLowerCase();
      let rows = (await customers().findMany()) ?? [];
      if (scope !== 'all') rows = rows.filter((row) => scope.has(row.id));
      if (search) {
        rows = rows.filter(
          (row) =>
            row.name?.toLowerCase().includes(search) ||
            row.code?.toLowerCase().includes(search) ||
            (row.contact ?? '').toLowerCase().includes(search),
        );
      }
      return paginate(rows, query);
    },

    async getCustomer(id, actor) {
      const scope = await visibleCustomers(actor);
      if (scope !== 'all' && !scope.has(id)) {
        throw new ServiceNotFoundError('Customer not found');
      }
      return requireCustomer(id);
    },

    async createCustomer(input, actor) {
      requireManager(actor, 'create');
      const name = input.name?.trim();
      if (!name) {
        throw new ServiceValidationError('Customer name is required', {
          name: 'required',
        });
      }
      const code = input.code?.trim() || (await nextCustomerCode(customers()));
      const existing = await customers().findOne({ filter: { code } });
      if (existing) {
        throw new ServiceConflictError(`Customer code ${code} already exists`);
      }
      const now = new Date().toISOString();
      const created = await customers().createOne({
        values: {
          code,
          name,
          contact: input.contact ?? null,
          phone: input.phone ?? null,
          level: input.level ?? 'standard',
          region: input.region ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });
      return created.record;
    },

    async updateCustomer(id, input, actor) {
      requireManager(actor, 'update');
      await requireCustomer(id);
      if (input.name !== undefined && !input.name.trim()) {
        throw new ServiceValidationError('Customer name is required', {
          name: 'required',
        });
      }
      const updated = await customers().updateOne({
        filter: { id },
        values: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.contact !== undefined ? { contact: input.contact } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.level !== undefined ? { level: input.level } : {}),
          ...(input.region !== undefined ? { region: input.region } : {}),
          updatedAt: new Date().toISOString(),
        },
      });
      return updated.record;
    },

    async listDevices(query, actor) {
      const scope = await visibleDevices(actor);
      if (scope !== 'all' && scope.size === 0) {
        return { items: [], total: 0, page: 1, pageSize: 0 };
      }
      const search = query.search?.toLowerCase();
      let rows = (await devices().findMany()) ?? [];
      if (scope !== 'all') rows = rows.filter((row) => scope.has(row.id));
      if (search) {
        rows = rows.filter(
          (row) =>
            row.deviceNo?.toLowerCase().includes(search) ||
            row.model?.toLowerCase().includes(search) ||
            (row.serialNo ?? '').toLowerCase().includes(search),
        );
      }
      const page = paginate(rows, query);
      return { ...page, items: await attachCustomerNames(page.items) };
    },

    async getDevice(id, actor) {
      const scope = await visibleDevices(actor);
      if (scope !== 'all' && !scope.has(id)) {
        throw new ServiceNotFoundError('Device not found');
      }
      const device = await devices().findOne({ filter: { id } });
      if (!device) throw new ServiceNotFoundError('Device not found');
      return device;
    },

    async createDevice(input, actor) {
      requireManager(actor, 'create');
      const deviceNo = input.deviceNo?.trim();
      const model = input.model?.trim();
      const fields: Record<string, string> = {};
      if (!deviceNo) fields.deviceNo = 'required';
      if (!model) fields.model = 'required';
      if (input.customerId == null) fields.customerId = 'required';
      if (Object.keys(fields).length > 0) {
        throw new ServiceValidationError(
          'Missing required device fields',
          fields,
        );
      }
      await requireCustomer(input.customerId as number);
      const duplicate = await devices().findOne({ filter: { deviceNo } });
      if (duplicate) {
        throw new ServiceConflictError(
          `Device number ${deviceNo} already exists`,
        );
      }
      const now = new Date().toISOString();
      const created = await devices().createOne({
        values: {
          deviceNo,
          model,
          serialNo: input.serialNo ?? null,
          customerId: input.customerId ?? null,
          status: (input.status ?? 'active') as Device['status'],
          installedAt: normalizeTemporal(input.installedAt),
          warrantyUntil: normalizeTemporal(input.warrantyUntil),
          nextInspectionAt: normalizeTemporal(input.nextInspectionAt),
          location: input.location ?? null,
          notes: input.notes ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });
      return created.record;
    },

    async updateDevice(id, input, actor) {
      requireManager(actor, 'update');
      const existing = await devices().findOne({ filter: { id } });
      if (!existing) throw new ServiceNotFoundError('Device not found');
      if (input.customerId != null) await requireCustomer(input.customerId);
      const updated = await devices().updateOne({
        filter: { id },
        values: {
          ...(input.model !== undefined ? { model: input.model } : {}),
          ...(input.serialNo !== undefined ? { serialNo: input.serialNo } : {}),
          ...(input.customerId !== undefined
            ? { customerId: input.customerId }
            : {}),
          ...(input.status !== undefined
            ? { status: input.status as Device['status'] }
            : {}),
          ...(input.installedAt !== undefined
            ? { installedAt: normalizeTemporal(input.installedAt) }
            : {}),
          ...(input.warrantyUntil !== undefined
            ? { warrantyUntil: normalizeTemporal(input.warrantyUntil) }
            : {}),
          ...(input.nextInspectionAt !== undefined
            ? { nextInspectionAt: normalizeTemporal(input.nextInspectionAt) }
            : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          updatedAt: new Date().toISOString(),
        },
      });
      return updated.record;
    },

    async listKnowledge(query, actor) {
      if (
        !isManager(actor) &&
        !hasRole(actor, 'engineer') &&
        !hasRole(actor, 'observer')
      ) {
        throw new ServiceForbiddenError('Not allowed to read knowledge');
      }
      const manager = isManager(actor);
      const search = query.search?.toLowerCase();
      let rows = (await articles().findMany()) ?? [];
      if (!manager) rows = rows.filter((row) => row.status === 'published');
      if (search) {
        rows = rows.filter(
          (row) =>
            row.title?.toLowerCase().includes(search) ||
            (row.summary ?? '').toLowerCase().includes(search) ||
            (row.tags ?? '').toLowerCase().includes(search),
        );
      }
      return paginate(rows, query);
    },

    async getKnowledge(id, actor) {
      const article = await articles().findOne({ filter: { id } });
      if (!article)
        throw new ServiceNotFoundError('Knowledge article not found');
      if (article.status !== 'published' && !isManager(actor)) {
        throw new ServiceNotFoundError('Knowledge article not found');
      }
      if (
        !isManager(actor) &&
        !hasRole(actor, 'engineer') &&
        !hasRole(actor, 'observer')
      ) {
        throw new ServiceForbiddenError('Not allowed to read knowledge');
      }
      return article;
    },

    async createKnowledge(input, actor) {
      requireManager(actor, 'create');
      const title = input.title?.trim();
      const content = input.content?.trim();
      const fields: Record<string, string> = {};
      if (!title) fields.title = 'required';
      if (!content) fields.content = 'required';
      if (Object.keys(fields).length > 0) {
        throw new ServiceValidationError(
          'Missing required knowledge fields',
          fields,
        );
      }
      const now = new Date().toISOString();
      const created = await articles().createOne({
        values: {
          title,
          category: input.category ?? null,
          deviceModel: input.deviceModel ?? null,
          tags: input.tags ?? null,
          status: input.status ?? 'published',
          summary: input.summary ?? null,
          content,
          createdById: Number(actor.id) || null,
          createdAt: now,
          updatedAt: now,
        },
      });
      return created.record;
    },

    async updateKnowledge(id, input, actor) {
      requireManager(actor, 'update');
      const existing = await articles().findOne({ filter: { id } });
      if (!existing)
        throw new ServiceNotFoundError('Knowledge article not found');
      const updated = await articles().updateOne({
        filter: { id },
        values: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.deviceModel !== undefined
            ? { deviceModel: input.deviceModel }
            : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.summary !== undefined ? { summary: input.summary } : {}),
          ...(input.content !== undefined ? { content: input.content } : {}),
          updatedAt: new Date().toISOString(),
        },
      });
      return updated.record;
    },

    async deleteKnowledge(id, actor) {
      requireManager(actor, 'delete');
      const existing = await articles().findOne({ filter: { id } });
      if (!existing)
        throw new ServiceNotFoundError('Knowledge article not found');
      await articles().deleteOne({ filter: { id } });
    },
  };
}

async function nextCustomerCode(
  repository: Repository<Customer>,
): Promise<string> {
  const total = await repository.count();
  return `CUST-${String(total + 1).padStart(4, '0')}`;
}

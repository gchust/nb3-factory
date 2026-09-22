import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  canProcessTickets,
  isAssignableRegion,
  regionScopeOf,
  requireCapability,
  type ServiceCaller,
} from './service-auth.js';
import { insertReturning, isUniqueViolation, updateReturning } from './db.js';
import { ServiceRuleError } from './tickets.js';

function regionScoped(caller: ServiceCaller): string | null {
  return regionScopeOf(caller);
}

function paginate<T>(rows: readonly T[], page: number, pageSize: number) {
  const normalizedPage = Math.max(1, page);
  const normalizedSize = Math.min(100, Math.max(1, pageSize));
  const start = (normalizedPage - 1) * normalizedSize;
  return {
    items: rows.slice(start, start + normalizedSize),
    total: rows.length,
    page: normalizedPage,
    pageSize: normalizedSize,
  };
}

export class CatalogService {
  constructor(private readonly app: Application) {}

  private get database() {
    return this.app.container.resolve(databaseManagerToken);
  }

  private get query() {
    return this.database.query();
  }

  async listCustomers(
    caller: ServiceCaller,
    filters: {
      search?: string;
      region?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    await requireCapability(caller, 'customers.view');
    let query = this.query.selectFrom('serviceCustomers').selectAll();
    const scope = regionScoped(caller);
    if (scope) query = query.where('region', '=', scope);
    if (filters.region) query = query.where('region', '=', filters.region);
    if (filters.search?.trim()) {
      const search = `%${filters.search.trim()}%`;
      query = query.where((builder) =>
        builder.or([
          builder('name', 'like', search),
          builder('contactName', 'like', search),
        ]),
      );
    }
    const rows = await query.orderBy('id', 'asc').limit(500).execute();
    return paginate(rows, filters.page ?? 1, filters.pageSize ?? 20);
  }

  async customerDetail(caller: ServiceCaller, id: number) {
    await requireCapability(caller, 'customers.view');
    const customer = await this.query
      .selectFrom('serviceCustomers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!customer) throw new ServiceRuleError('Customer not found', 404);
    const scope = regionScoped(caller);
    if (scope && String(customer.region) !== scope)
      throw new ServiceRuleError('Customer is not accessible', 404);
    const devices = await this.query
      .selectFrom('serviceDevices')
      .selectAll()
      .where('customerId', '=', id)
      .execute();
    const decoratedDevices = devices.map((device) => ({
      ...device,
      customerName: customer.name ?? null,
    }));
    const tickets = await this.query
      .selectFrom('serviceTickets')
      .select([
        'id',
        'ticketNo',
        'title',
        'status',
        'priority',
        'region',
        'confidential',
        'assigneeId',
        'reporterId',
        'updatedAt',
      ])
      .where('customerId', '=', id)
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .execute();
    return { customer, devices: decoratedDevices, tickets };
  }

  async saveCustomer(
    caller: ServiceCaller,
    input: {
      id?: number;
      name: string;
      region: string;
      contactName?: string;
      contactPhone?: string;
      address?: string;
      status?: string;
    },
  ) {
    await requireCapability(caller, 'customers.manage');
    if (!input.name?.trim()) throw new ServiceRuleError('Name is required');
    if (!['east', 'south', 'north', 'west'].includes(input.region))
      throw new ServiceRuleError('Unsupported region');
    const now = new Date();
    if (input.id) {
      return updateReturning(
        this.query,
        'serviceCustomers',
        {
          name: input.name.trim(),
          region: input.region,
          contactName: input.contactName ?? null,
          contactPhone: input.contactPhone ?? null,
          address: input.address ?? null,
          status: input.status ?? 'active',
          updatedAt: now,
        },
        { id: input.id },
      );
    }
    const duplicate = await this.query
      .selectFrom('serviceCustomers')
      .select('id')
      .where('name', '=', input.name.trim())
      .executeTakeFirst();
    if (duplicate)
      throw new ServiceRuleError('Customer name already exists', 409);
    try {
      return await insertReturning(
        this.query,
        'serviceCustomers',
        {
          name: input.name.trim(),
          region: input.region,
          contactName: input.contactName ?? null,
          contactPhone: input.contactPhone ?? null,
          address: input.address ?? null,
          status: input.status ?? 'active',
          createdAt: now,
          updatedAt: now,
        },
        { name: input.name.trim() },
      );
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ServiceRuleError('Customer name already exists', 409);
      throw error;
    }
  }

  async listDevices(
    caller: ServiceCaller,
    filters: {
      search?: string;
      region?: string;
      customerId?: number;
      page?: number;
      pageSize?: number;
    },
  ) {
    await requireCapability(caller, 'devices.view');
    let query = this.query.selectFrom('serviceDevices').selectAll();
    const scope = regionScoped(caller);
    if (scope) query = query.where('region', '=', scope);
    if (filters.region) query = query.where('region', '=', filters.region);
    if (filters.customerId)
      query = query.where('customerId', '=', filters.customerId);
    if (filters.search?.trim()) {
      const search = `%${filters.search.trim()}%`;
      query = query.where((builder) =>
        builder.or([
          builder('code', 'like', search),
          builder('name', 'like', search),
          builder('serialNumber', 'like', search),
        ]),
      );
    }
    const rows = await query.orderBy('id', 'asc').limit(500).execute();
    const page = paginate(rows, filters.page ?? 1, filters.pageSize ?? 20);
    // The customer column names the owner; the raw integer id is not a label.
    const customerIds = [
      ...new Set(page.items.map((device) => Number(device.customerId))),
    ];
    const customers = customerIds.length
      ? await this.query
          .selectFrom('serviceCustomers')
          .select(['id', 'name'])
          .where('id', 'in', customerIds)
          .execute()
      : [];
    const customerById = new Map(
      customers.map((customer) => [Number(customer.id), customer.name]),
    );
    return {
      ...page,
      items: page.items.map((device) => ({
        ...device,
        customerName: customerById.get(Number(device.customerId)) ?? null,
      })),
    };
  }

  async saveDevice(
    caller: ServiceCaller,
    input: {
      id?: number;
      code: string;
      name: string;
      customerId: number;
      region: string;
      category?: string;
      model?: string;
      serialNumber?: string;
      ownerId?: string;
      enabled?: boolean;
    },
  ) {
    await requireCapability(caller, 'devices.manage');
    if (!input.code?.trim() || !input.name?.trim())
      throw new ServiceRuleError('Code and name are required');
    const customer = await this.query
      .selectFrom('serviceCustomers')
      .select('id')
      .where('id', '=', input.customerId)
      .executeTakeFirst();
    if (!customer) throw new ServiceRuleError('Customer not found', 404);
    const now = new Date();
    const code = input.code.trim();
    // The code is unique across the ledger. Check the edit path explicitly and
    // translate a raced constraint violation as well, so both create and edit
    // answer 409 with a readable message instead of a driver-level 500.
    let duplicateQuery = this.query
      .selectFrom('serviceDevices')
      .select('id')
      .where('code', '=', code);
    if (input.id) duplicateQuery = duplicateQuery.where('id', '!=', input.id);
    const duplicate = await duplicateQuery.executeTakeFirst();
    if (duplicate)
      throw new ServiceRuleError('Device code already exists', 409);
    try {
      if (input.id) {
        return await updateReturning(
          this.query,
          'serviceDevices',
          {
            code,
            name: input.name.trim(),
            customerId: input.customerId,
            region: input.region,
            category: input.category ?? null,
            model: input.model ?? null,
            serialNumber: input.serialNumber ?? null,
            ownerId: input.ownerId ?? null,
            enabled: input.enabled ?? true,
            updatedAt: now,
          },
          { id: input.id },
        );
      }
      return await insertReturning(
        this.query,
        'serviceDevices',
        {
          code,
          name: input.name.trim(),
          customerId: input.customerId,
          region: input.region,
          category: input.category ?? null,
          model: input.model ?? null,
          serialNumber: input.serialNumber ?? null,
          ownerId: input.ownerId ?? null,
          enabled: input.enabled ?? true,
          createdAt: now,
          updatedAt: now,
        },
        { code },
      );
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ServiceRuleError('Device code already exists', 409);
      throw error;
    }
  }

  async listKnowledge(
    caller: ServiceCaller,
    filters: {
      search?: string;
      category?: string;
      status?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    await requireCapability(caller, 'knowledge.view');
    let query = this.query.selectFrom('serviceKnowledge').selectAll();
    if (filters.category)
      query = query.where('deviceCategory', '=', filters.category);
    if (filters.status) query = query.where('status', '=', filters.status);
    if (filters.search?.trim()) {
      const search = `%${filters.search.trim()}%`;
      query = query.where((builder) =>
        builder.or([
          builder('title', 'like', search),
          builder('summary', 'like', search),
          builder('body', 'like', search),
        ]),
      );
    }
    const rows = await query.orderBy('id', 'desc').limit(500).execute();
    return paginate(rows, filters.page ?? 1, filters.pageSize ?? 20);
  }

  async knowledgeDetail(caller: ServiceCaller, id: number) {
    await requireCapability(caller, 'knowledge.view');
    const article = await this.query
      .selectFrom('serviceKnowledge')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!article) throw new ServiceRuleError('Article not found', 404);
    await this.query
      .updateTable('serviceKnowledge')
      .set({ viewCount: Number(article.viewCount ?? 0) + 1 })
      .where('id', '=', id)
      .execute();
    const links = await this.query
      .selectFrom('serviceKnowledgeFiles')
      .selectAll()
      .where('knowledgeId', '=', id)
      .execute();
    const fileIds = links.map((row) => String(row.fileId));
    const files = fileIds.length
      ? await this.query
          .selectFrom('serviceFiles')
          .selectAll()
          .where('id', 'in', fileIds)
          .execute()
      : [];
    return { article, files };
  }

  async attachKnowledgeFiles(
    caller: ServiceCaller,
    knowledgeId: number,
    fileIds: readonly string[],
  ) {
    await requireCapability(caller, 'knowledge.manage');
    const article = await this.query
      .selectFrom('serviceKnowledge')
      .select('id')
      .where('id', '=', knowledgeId)
      .executeTakeFirst();
    if (!article) throw new ServiceRuleError('Article not found', 404);
    const now = new Date();
    const created = [];
    for (const fileId of fileIds) {
      const existing = await this.query
        .selectFrom('serviceKnowledgeFiles')
        .select('id')
        .where('knowledgeId', '=', knowledgeId)
        .where('fileId', '=', fileId)
        .executeTakeFirst();
      if (existing) continue;
      created.push(
        await insertReturning(
          this.query,
          'serviceKnowledgeFiles',
          { knowledgeId, fileId, createdAt: now },
          { knowledgeId, fileId },
        ),
      );
    }
    return created;
  }

  async saveKnowledge(
    caller: ServiceCaller,
    input: {
      id?: number;
      title: string;
      deviceCategory?: string;
      summary?: string;
      body?: string;
      status?: string;
    },
  ) {
    await requireCapability(caller, 'knowledge.manage');
    if (!input.title?.trim()) throw new ServiceRuleError('Title is required');
    const now = new Date();
    const status = input.status ?? 'published';
    if (input.id) {
      return updateReturning(
        this.query,
        'serviceKnowledge',
        {
          title: input.title.trim(),
          deviceCategory: input.deviceCategory ?? null,
          summary: input.summary ?? null,
          body: input.body ?? null,
          status,
          publishedAt: status === 'published' ? now : null,
          updatedAt: now,
        },
        { id: input.id },
      );
    }
    return insertReturning(
      this.query,
      'serviceKnowledge',
      {
        title: input.title.trim(),
        deviceCategory: input.deviceCategory ?? null,
        summary: input.summary ?? null,
        body: input.body ?? null,
        status,
        authorId: caller.id,
        viewCount: 0,
        publishedAt: status === 'published' ? now : null,
        createdAt: now,
        updatedAt: now,
      },
      { title: input.title.trim() },
    );
  }

  async listMembers(caller: ServiceCaller) {
    await requireCapability(caller, 'members.view');
    const members = await this.query
      .selectFrom('serviceMembers')
      .selectAll()
      .orderBy('region', 'asc')
      .execute();
    // The member row stores the user id; display name lives on the user table.
    const userIds = members.map((member) => String(member.userId));
    const users = userIds.length
      ? await this.query
          .selectFrom('user')
          .select(['id', 'name', 'username'])
          .where('id', 'in', userIds)
          .execute()
      : [];
    const nameById = new Map(
      users.map((user) => [
        String(user.id),
        (user.name as string | null) ??
          (user.username as string | null) ??
          null,
      ]),
    );
    // The assignee selector must list only members who can actually work a
    // ticket. The same list still serves sharing and team views, so the
    // eligibility travels as a per-row flag instead of filtering the result.
    return await Promise.all(
      members.map(async (member) => ({
        ...member,
        userName: nameById.get(String(member.userId)) ?? null,
        assignable:
          isAssignableRegion(member.region as string | null) &&
          (await canProcessTickets(this.app, String(member.userId))),
      })),
    );
  }

  async listMemberCandidates(caller: ServiceCaller) {
    await requireCapability(caller, 'members.manage');
    const users = await this.query
      .selectFrom('user')
      .select(['id', 'name', 'username', 'email'])
      .where('deletedAt', 'is', null)
      .orderBy('id', 'asc')
      .limit(200)
      .execute();
    return users.map((user) => ({
      id: String(user.id),
      name: (user.name as string | null) ?? null,
      username: (user.username as string | null) ?? null,
      email: (user.email as string | null) ?? null,
    }));
  }

  async saveMember(
    caller: ServiceCaller,
    input: { id?: number; userId: string; region: string; teamName?: string },
  ) {
    await requireCapability(caller, 'members.manage');
    if (!['east', 'south', 'north', 'west', 'none'].includes(input.region))
      throw new ServiceRuleError('Unsupported region');
    const now = new Date();
    const existing = await this.query
      .selectFrom('serviceMembers')
      .select('id')
      .where('userId', '=', input.userId)
      .executeTakeFirst();
    if (existing) {
      return updateReturning(
        this.query,
        'serviceMembers',
        {
          region: input.region,
          teamName: input.teamName ?? null,
          updatedAt: now,
        },
        { userId: input.userId },
      );
    }
    return insertReturning(
      this.query,
      'serviceMembers',
      {
        userId: input.userId,
        region: input.region,
        teamName: input.teamName ?? null,
        createdAt: now,
        updatedAt: now,
      },
      { userId: input.userId },
    );
  }
}

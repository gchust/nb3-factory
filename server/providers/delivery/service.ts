import type { DatabaseManager, QueryAdapter } from '@nocobase/db';

import {
  CONTRACT_TRANSITIONS,
  FILE_EXPOSURES,
  MAX_FILES_PER_UPLOAD,
  MAX_FILE_BYTES,
  MILESTONE_STATUSES,
  PAYMENT_METHODS,
  type ContractStatus,
  type FileKind,
} from './constants.js';
import {
  canAcceptMilestone,
  canManageContract,
  canManageMoney,
  canMaintainContracts,
  canReadContract,
  isUnrestricted,
  resolveActor,
  resolveContractScope,
  type Actor,
  type ContractScope,
} from './access.js';
import { badRequest, conflict, forbidden, notFound } from './errors.js';

export interface DeliveryContext {
  readonly actor: Actor;
  readonly scope: ContractScope;
}

type Row = Record<string, unknown>;

function timestamp(): string {
  return new Date().toISOString().slice(0, -1);
}

function num(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (value instanceof Date) return value.toISOString();
  return '';
}

function intOrNull(value: unknown): number | null {
  if (typeof value === 'number')
    return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function requireInteger(value: unknown, field: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw badRequest(
      'INVALID_AMOUNT',
      `${field} must be a whole number of minor units.`,
    );
  }
  return parsed;
}

function requireNonNegative(value: unknown, field: string): number {
  const parsed = requireInteger(value, field);
  if (parsed < 0)
    throw badRequest('NEGATIVE_AMOUNT', `${field} must not be negative.`);
  return parsed;
}

function requireText(value: unknown, field: string, max = 200): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw badRequest('REQUIRED_FIELD', `${field} is required.`);
  if (text.length > max)
    throw badRequest('FIELD_TOO_LONG', `${field} is too long.`);
  return text;
}

function optionalText(value: unknown, max = 4000): string | null {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).slice(0, max);
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, max);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface Paged<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}

function pageList<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): Paged<T> {
  const hasMore = items.length > pageSize;
  return {
    items: hasMore ? items.slice(0, pageSize) : items,
    page,
    pageSize,
    hasMore,
  };
}

function normalizePage(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export class DeliveryService {
  private readonly basePath: string;

  constructor(
    private readonly database: DatabaseManager,
    publicBasePath = '',
  ) {
    const normalized = publicBasePath.replace(/\/+$/, '');
    this.basePath = normalized === '/' ? '' : normalized;
  }

  private get query(): QueryAdapter {
    return this.database.query();
  }

  async contextFor(userId: string, name: string): Promise<DeliveryContext> {
    const actor = await resolveActor(this.query, userId, name);
    const scope = await resolveContractScope(this.query, actor);
    return { actor, scope };
  }

  /** Explicit next identifier: the query adapter has no `returning` support. */
  private async nextId(table: string): Promise<number> {
    const rows = await this.query
      .selectFrom(table)
      .select('id')
      .orderBy('id', 'desc')
      .limit(1)
      .execute();
    return rows.length ? num(rows[0]?.id) + 1 : 1;
  }

  // ---------------------------------------------------------------- users

  async listUsers(context: DeliveryContext): Promise<readonly Row[]> {
    // The directory feeds two things: the business lead's member picker and the
    // milestone owner/acceptance-specialist pickers, which a project manager
    // also maintains for the contracts they own. Restricting it to the lead
    // left those pickers empty for everyone else.
    if (!canMaintainContracts(context.actor)) {
      throw forbidden(
        'Only the business lead or a project manager can view the user directory.',
      );
    }
    const rows = await this.query
      .selectFrom('user')
      .select(['id', 'name', 'username', 'email'])
      .orderBy('name', 'asc')
      .execute();
    return rows;
  }

  private async userNameMap(): Promise<Map<string, string>> {
    const rows = await this.query
      .selectFrom('user')
      .select(['id', 'name', 'username'])
      .execute();
    const map = new Map<string, string>();
    for (const row of rows) {
      const record = row as { id: unknown; name: unknown; username: unknown };
      map.set(str(record.id), str(record.name) || str(record.username));
    }
    return map;
  }

  // ------------------------------------------------------------ customers

  async listCustomers(
    context: DeliveryContext,
    input: { search?: string; page?: unknown; pageSize?: unknown },
  ): Promise<Paged<Row>> {
    void context;
    const page = normalizePage(input.page, 1);
    const pageSize = Math.min(normalizePage(input.pageSize, 20), 100);
    let builder = this.query
      .selectFrom('cdCustomers')
      .selectAll()
      .orderBy('id', 'asc')
      .limit(pageSize + 1)
      .offset((page - 1) * pageSize);
    const search = input.search?.trim();
    if (search) builder = builder.where('name', 'like', `%${search}%`);
    const rows = await builder.execute();
    return pageList(rows, page, pageSize);
  }

  async createCustomer(context: DeliveryContext, input: Row): Promise<Row> {
    if (!canMaintainContracts(context.actor)) {
      throw forbidden('You cannot create customers.');
    }
    const code = requireText(input.code, 'Customer code', 32);
    const name = requireText(input.name, 'Customer name', 200);
    const duplicate = await this.query
      .selectFrom('cdCustomers')
      .select('id')
      .where('code', '=', code)
      .limit(1)
      .executeTakeFirst();
    if (duplicate)
      throw conflict(
        'DUPLICATE_CUSTOMER_CODE',
        'Customer code already exists.',
      );
    const now = timestamp();
    const id = await this.nextId('cdCustomers');
    await this.query
      .insertInto('cdCustomers')
      .values({
        id,
        code,
        name,
        industry: optionalText(input.industry, 100),
        level: optionalText(input.level, 32),
        ownerId: context.actor.userId,
        note: optionalText(input.note),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return this.getCustomer(id);
  }

  async updateCustomer(
    context: DeliveryContext,
    id: number,
    input: Row,
  ): Promise<Row> {
    if (!canMaintainContracts(context.actor)) {
      throw forbidden('You cannot update customers.');
    }
    await this.getCustomer(id);
    await this.query
      .updateTable('cdCustomers')
      .set({
        name: requireText(input.name, 'Customer name', 200),
        industry: optionalText(input.industry, 100),
        level: optionalText(input.level, 32),
        note: optionalText(input.note),
        updatedAt: timestamp(),
      })
      .where('id', '=', id)
      .execute();
    return this.getCustomer(id);
  }

  private async getCustomer(id: number): Promise<Row> {
    const row = await this.query
      .selectFrom('cdCustomers')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw notFound('Customer not found.');
    return row;
  }

  async listContacts(input: { customerId?: unknown }): Promise<readonly Row[]> {
    const customerId = intOrNull(input.customerId);
    let builder = this.query
      .selectFrom('cdContacts')
      .selectAll()
      .orderBy('isPrimary', 'desc')
      .orderBy('id', 'asc');
    if (customerId !== null)
      builder = builder.where('customerId', '=', customerId);
    return await builder.execute();
  }

  // ------------------------------------------------------------ contracts

  private async assertContractReadable(
    context: DeliveryContext,
    contractId: number,
  ): Promise<Row> {
    const contract = await this.query
      .selectFrom('cdContracts')
      .selectAll()
      .where('id', '=', contractId)
      .executeTakeFirst();
    if (!contract) throw notFound('Contract not found.');
    if (!canReadContract(context.scope, contractId)) {
      throw forbidden('This contract is outside your scope.');
    }
    return contract;
  }

  private async assertContractWritable(
    context: DeliveryContext,
    contractId: number,
  ): Promise<Row> {
    const contract = await this.assertContractReadable(context, contractId);
    if (!canManageContract(context.scope, contractId)) {
      throw forbidden('You cannot maintain this contract.');
    }
    return contract;
  }

  async listContracts(
    context: DeliveryContext,
    input: {
      search?: string;
      status?: string;
      customerId?: unknown;
      page?: unknown;
      pageSize?: unknown;
    },
  ): Promise<Paged<Row>> {
    const page = normalizePage(input.page, 1);
    const pageSize = Math.min(normalizePage(input.pageSize, 20), 100);
    let builder = this.query
      .selectFrom('cdContracts')
      .selectAll()
      .orderBy('id', 'desc')
      .limit(pageSize + 1)
      .offset((page - 1) * pageSize);
    if (!context.scope.readAll) {
      const ids = [...context.scope.readableContractIds];
      if (!ids.length) return pageList([], page, pageSize);
      builder = builder.where('id', 'in', ids);
    }
    const search = input.search?.trim();
    if (search) {
      // One search box covers the reference, the title and the customer name;
      // matching only the reference made title and customer searches return an
      // empty list, which reads as "no such contract".
      const pattern = `%${search}%`;
      const customerMatches = await this.query
        .selectFrom('cdCustomers')
        .select('id')
        .where('name', 'like', pattern)
        .execute();
      const customerIds = customerMatches.map((row) => num(row.id));
      builder = builder.where((eb) =>
        eb.or([
          eb('contractNo', 'like', pattern),
          eb('title', 'like', pattern),
          ...(customerIds.length ? [eb('customerId', 'in', customerIds)] : []),
        ]),
      );
    }
    if (input.status && input.status !== 'all') {
      builder = builder.where('status', '=', input.status);
    }
    const customerId = intOrNull(input.customerId);
    if (customerId !== null)
      builder = builder.where('customerId', '=', customerId);

    const rows = await builder.execute();
    const paged = pageList(rows, page, pageSize);
    const names = await this.userNameMap();
    const customerRows = await this.query
      .selectFrom('cdCustomers')
      .select(['id', 'name'])
      .execute();
    const customerNames = new Map<number, string>();
    for (const row of customerRows) {
      const record = row as { id: unknown; name: unknown };
      customerNames.set(num(record.id), str(record.name));
    }
    const items = [];
    for (const row of paged.items) {
      items.push({
        ...row,
        customerName: customerNames.get(num(row.customerId)) ?? '',
        managerName: names.get(str(row.managerId)) ?? '',
        isOverdue:
          str(row.status) !== 'completed' && str(row.endDate) < today(),
        ...(await this.contractProgress(num(row.id))),
      });
    }
    return { ...paged, items };
  }

  private async contractProgress(contractId: number): Promise<{
    milestoneCount: number;
    acceptedMilestoneCount: number;
    allocatedCents: number;
    progressPercent: number;
  }> {
    const rows = await this.query
      .selectFrom('cdMilestones')
      .select(['status', 'amountCents'])
      .where('contractId', '=', contractId)
      .execute();
    const accepted = rows.filter((row) => row.status === 'accepted').length;
    const allocated = rows.reduce(
      (total, row) => total + num(row.amountCents),
      0,
    );
    return {
      milestoneCount: rows.length,
      acceptedMilestoneCount: accepted,
      allocatedCents: allocated,
      progressPercent: rows.length
        ? Math.round((accepted / rows.length) * 100)
        : 0,
    };
  }

  async getContract(
    context: DeliveryContext,
    contractId: number,
  ): Promise<Row> {
    const contract = await this.assertContractReadable(context, contractId);
    const customer = await this.query
      .selectFrom('cdCustomers')
      .selectAll()
      .where('id', '=', num(contract.customerId))
      .executeTakeFirst();
    const contacts = await this.query
      .selectFrom('cdContacts')
      .selectAll()
      .where('customerId', '=', num(contract.customerId))
      .execute();
    const memberRows = await this.query
      .selectFrom('cdContractMembers')
      .selectAll()
      .where('contractId', '=', contractId)
      .orderBy('id', 'asc')
      .execute();
    const names = await this.userNameMap();
    const changeRows = await this.query
      .selectFrom('cdContractChanges')
      .selectAll()
      .where('contractId', '=', contractId)
      .orderBy('id', 'desc')
      .execute();
    const milestoneRows = await this.query
      .selectFrom('cdMilestones')
      .selectAll()
      .where('contractId', '=', contractId)
      .orderBy('seq', 'asc')
      .orderBy('id', 'asc')
      .execute();

    const milestones = [];
    for (const milestone of milestoneRows) {
      const milestoneId = num(milestone.id);
      const deliverable = await this.query
        .selectFrom('cdDeliverables')
        .selectAll()
        .where('milestoneId', '=', milestoneId)
        .orderBy('id', 'asc')
        .executeTakeFirst();
      const receivable = await this.query
        .selectFrom('cdReceivables')
        .selectAll()
        .where('milestoneId', '=', milestoneId)
        .executeTakeFirst();
      const deliverableRow = deliverable ? deliverable : null;
      const versions = deliverableRow
        ? await this.listVersionsForDeliverable(
            context,
            num(deliverableRow.id),
            milestoneId,
          )
        : [];
      milestones.push({
        ...milestone,
        isOverdue:
          str(milestone.status) !== 'accepted' &&
          str(milestone.dueDate) < today(),
        ownerName: names.get(str(milestone.ownerId)) ?? '',
        acceptorName: names.get(str(milestone.acceptorId)) ?? '',
        canManage: canManageContract(context.scope, contractId),
        canAccept: canAcceptMilestone(context.scope, milestoneId),
        deliverable: deliverableRow,
        versions,
        receivable: receivable ?? null,
      });
    }

    return {
      contract,
      customer: customer ?? null,
      contacts,
      managerName: names.get(str(contract.managerId)) ?? '',
      members: memberRows.map((row) => ({
        ...row,
        userName: names.get(str(row.userId)) ?? str(row.userId),
      })),
      changes: changeRows.map((row) => ({
        ...row,
        createdByName: names.get(str(row.createdById)) ?? '',
      })),
      milestones,
      files: await this.listFiles(context, 'contract', contractId),
      progress: await this.contractProgress(contractId),
      canManage: canManageContract(context.scope, contractId),
      canManageMoney: canManageMoney(context.actor),
      canManageMembers: isUnrestricted(context.actor),
    };
  }

  async createContract(context: DeliveryContext, input: Row): Promise<Row> {
    if (!canMaintainContracts(context.actor)) {
      throw forbidden('You cannot create contracts.');
    }
    const contractNo = requireText(input.contractNo, 'Contract number', 64);
    const duplicate = await this.query
      .selectFrom('cdContracts')
      .select('id')
      .where('contractNo', '=', contractNo)
      .limit(1)
      .executeTakeFirst();
    if (duplicate)
      throw conflict(
        'DUPLICATE_CONTRACT_NO',
        'Contract number already exists.',
      );
    const amountCents = requireNonNegative(
      input.amountCents ?? 0,
      'Contract amount',
    );
    const customerId = intOrNull(input.customerId);
    if (customerId === null)
      throw badRequest('REQUIRED_FIELD', 'Customer is required.');
    await this.getCustomer(customerId);
    const managerId = optionalText(input.managerId, 64) ?? context.actor.userId;
    const now = timestamp();
    const id = await this.nextId('cdContracts');
    await this.query
      .insertInto('cdContracts')
      .values({
        id,
        contractNo,
        title: requireText(input.title, 'Contract title', 200),
        customerId,
        amountCents,
        currency: (optionalText(input.currency, 8) ?? 'CNY').toUpperCase(),
        startDate: requireText(input.startDate, 'Start date', 20),
        endDate: requireText(input.endDate, 'End date', 20),
        managerId,
        status: 'draft',
        note: optionalText(input.note),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await this.query
      .insertInto('cdContractMembers')
      .values({
        contractId: id,
        userId: managerId,
        memberRole: 'manager',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return this.getContract(context, id);
  }

  async updateContract(
    context: DeliveryContext,
    contractId: number,
    input: Row,
  ): Promise<Row> {
    await this.assertContractWritable(context, contractId);
    const milestones = await this.query
      .selectFrom('cdMilestones')
      .select(['amountCents'])
      .where('contractId', '=', contractId)
      .execute();
    const allocated = milestones.reduce(
      (total, row) => total + num(row.amountCents),
      0,
    );
    const amountCents = requireNonNegative(
      input.amountCents ?? 0,
      'Contract amount',
    );
    if (amountCents < allocated) {
      throw badRequest(
        'AMOUNT_BELOW_ALLOCATION',
        'The contract amount cannot be lower than the amount already allocated to milestones.',
      );
    }
    const customerId = intOrNull(input.customerId);
    if (customerId === null)
      throw badRequest('REQUIRED_FIELD', 'Customer is required.');
    await this.getCustomer(customerId);
    await this.query
      .updateTable('cdContracts')
      .set({
        title: requireText(input.title, 'Contract title', 200),
        customerId,
        amountCents,
        currency: (optionalText(input.currency, 8) ?? 'CNY').toUpperCase(),
        startDate: requireText(input.startDate, 'Start date', 20),
        endDate: requireText(input.endDate, 'End date', 20),
        managerId: optionalText(input.managerId, 64),
        note: optionalText(input.note),
        updatedAt: timestamp(),
      })
      .where('id', '=', contractId)
      .execute();
    return this.getContract(context, contractId);
  }

  async changeContractStatus(
    context: DeliveryContext,
    contractId: number,
    next: unknown,
  ): Promise<Row> {
    const contract = await this.assertContractWritable(context, contractId);
    const current = str(contract.status) as ContractStatus;
    const target = str(next) as ContractStatus;
    if (!CONTRACT_TRANSITIONS[current]) {
      throw badRequest('INVALID_STATUS', 'Unknown contract status.');
    }
    if (!CONTRACT_TRANSITIONS[current].includes(target)) {
      throw conflict(
        'INVALID_TRANSITION',
        `A contract cannot move from ${current} to ${target}.`,
      );
    }
    await this.query
      .updateTable('cdContracts')
      .set({ status: target, updatedAt: timestamp() })
      .where('id', '=', contractId)
      .execute();
    return this.getContract(context, contractId);
  }

  async addContractMember(
    context: DeliveryContext,
    contractId: number,
    input: Row,
  ): Promise<Row> {
    if (!isUnrestricted(context.actor)) {
      throw forbidden('Only the business lead can change contract members.');
    }
    await this.assertContractReadable(context, contractId);
    const userId = requireText(input.userId, 'Member', 64);
    const memberRole = optionalText(input.memberRole, 32) ?? 'member';
    const existing = await this.query
      .selectFrom('cdContractMembers')
      .select('id')
      .where('contractId', '=', contractId)
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (existing)
      throw conflict(
        'DUPLICATE_MEMBER',
        'This member already belongs to the contract.',
      );
    const now = timestamp();
    await this.query
      .insertInto('cdContractMembers')
      .values({
        contractId,
        userId,
        memberRole,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return this.getContract(context, contractId);
  }

  async removeContractMember(
    context: DeliveryContext,
    contractId: number,
    memberId: number,
  ): Promise<Row> {
    if (!isUnrestricted(context.actor)) {
      throw forbidden('Only the business lead can change contract members.');
    }
    await this.assertContractReadable(context, contractId);
    await this.query
      .deleteFrom('cdContractMembers')
      .where('id', '=', memberId)
      .where('contractId', '=', contractId)
      .execute();
    return this.getContract(context, contractId);
  }

  async addContractChange(
    context: DeliveryContext,
    contractId: number,
    input: Row,
  ): Promise<Row> {
    await this.assertContractWritable(context, contractId);
    const now = timestamp();
    await this.query
      .insertInto('cdContractChanges')
      .values({
        contractId,
        changeType: optionalText(input.changeType, 32) ?? 'other',
        summary: requireText(input.summary, 'Change summary', 2000),
        beforeValue: optionalText(input.beforeValue, 200),
        afterValue: optionalText(input.afterValue, 200),
        createdById: context.actor.userId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return this.getContract(context, contractId);
  }

  // ----------------------------------------------------------- milestones

  async createMilestone(
    context: DeliveryContext,
    contractId: number,
    input: Row,
  ): Promise<Row> {
    await this.assertContractWritable(context, contractId);
    const amountCents = requireNonNegative(
      input.amountCents ?? 0,
      'Milestone amount',
    );
    await this.assertAllocationWithinContract(contractId, null, amountCents);
    const now = timestamp();
    const id = await this.nextId('cdMilestones');
    await this.query
      .insertInto('cdMilestones')
      .values({
        id,
        contractId,
        name: requireText(input.name, 'Milestone name', 200),
        seq: intOrNull(input.seq) ?? (await this.nextMilestoneSeq(contractId)),
        dueDate: requireText(input.dueDate, 'Due date', 20),
        ownerId: optionalText(input.ownerId, 64),
        acceptorId: optionalText(input.acceptorId, 64),
        amountCents,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return this.loadMilestone(id);
  }

  async updateMilestone(
    context: DeliveryContext,
    milestoneId: number,
    input: Row,
  ): Promise<Row> {
    const milestone = await this.loadMilestone(milestoneId);
    const contractId = num(milestone.contractId);
    await this.assertContractWritable(context, contractId);
    const amountCents = requireNonNegative(
      input.amountCents ?? 0,
      'Milestone amount',
    );
    await this.assertAllocationWithinContract(
      contractId,
      milestoneId,
      amountCents,
    );
    const status = optionalText(input.status, 32);
    if (status && !(MILESTONE_STATUSES as readonly string[]).includes(status)) {
      throw badRequest('INVALID_STATUS', 'Unknown milestone status.');
    }
    await this.query
      .updateTable('cdMilestones')
      .set({
        name: requireText(input.name, 'Milestone name', 200),
        seq: intOrNull(input.seq) ?? num(milestone.seq),
        dueDate: requireText(input.dueDate, 'Due date', 20),
        ownerId: optionalText(input.ownerId, 64),
        acceptorId: optionalText(input.acceptorId, 64),
        amountCents,
        ...(status ? { status } : {}),
        updatedAt: timestamp(),
      })
      .where('id', '=', milestoneId)
      .execute();
    return this.loadMilestone(milestoneId);
  }

  private async nextMilestoneSeq(contractId: number): Promise<number> {
    const rows = await this.query
      .selectFrom('cdMilestones')
      .select('seq')
      .where('contractId', '=', contractId)
      .execute();
    return rows.reduce((max, row) => Math.max(max, num(row.seq)), 0) + 1;
  }

  private async assertAllocationWithinContract(
    contractId: number,
    excludeMilestoneId: number | null,
    amountCents: number,
  ): Promise<void> {
    const contract = await this.query
      .selectFrom('cdContracts')
      .select('amountCents')
      .where('id', '=', contractId)
      .executeTakeFirst();
    if (!contract) throw notFound('Contract not found.');
    const rows = await this.query
      .selectFrom('cdMilestones')
      .select(['id', 'amountCents'])
      .where('contractId', '=', contractId)
      .execute();
    const allocated = rows
      .filter((row) => num(row.id) !== excludeMilestoneId)
      .reduce((total, row) => total + num(row.amountCents), 0);
    if (allocated + amountCents > num(contract.amountCents)) {
      throw badRequest(
        'ALLOCATION_EXCEEDS_CONTRACT',
        'The total allocated to milestones cannot exceed the contract amount.',
      );
    }
  }

  private async loadMilestone(milestoneId: number): Promise<Row> {
    const milestone = await this.query
      .selectFrom('cdMilestones')
      .selectAll()
      .where('id', '=', milestoneId)
      .executeTakeFirst();
    if (!milestone) throw notFound('Milestone not found.');
    return milestone;
  }

  private async loadMilestoneForRead(
    context: DeliveryContext,
    milestoneId: number,
  ): Promise<Row> {
    const milestone = await this.loadMilestone(milestoneId);
    await this.assertContractReadable(context, num(milestone.contractId));
    return milestone;
  }

  // ------------------------------------------- deliverables and versions

  async listDeliverables(
    context: DeliveryContext,
    milestoneId: number,
  ): Promise<readonly Row[]> {
    const milestone = await this.loadMilestoneForRead(context, milestoneId);
    const contractId = num(milestone.contractId);
    const rows = await this.query
      .selectFrom('cdDeliverables')
      .selectAll()
      .where('milestoneId', '=', milestoneId)
      .orderBy('id', 'asc')
      .execute();
    const names = await this.userNameMap();
    const result = [];
    for (const row of rows) {
      const versions = await this.listVersionsForDeliverable(
        context,
        num(row.id),
        milestoneId,
      );
      result.push({
        ...row,
        versions,
        latestVersion: versions[0] ?? null,
        canManage: canManageContract(context.scope, contractId),
        canAccept: canAcceptMilestone(context.scope, milestoneId),
        acceptorName: names.get(str(milestone.acceptorId)) ?? '',
      });
    }
    return result;
  }

  async createDeliverable(
    context: DeliveryContext,
    milestoneId: number,
    input: Row,
  ): Promise<Row> {
    const milestone = await this.loadMilestoneForRead(context, milestoneId);
    await this.assertContractWritable(context, num(milestone.contractId));
    const now = timestamp();
    const id = await this.nextId('cdDeliverables');
    await this.query
      .insertInto('cdDeliverables')
      .values({
        id,
        milestoneId,
        name: requireText(input.name, 'Deliverable name', 200),
        status: 'draft',
        currentVersion: 0,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return this.query
      .selectFrom('cdDeliverables')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst() as Promise<Row>;
  }

  private async listVersionsForDeliverable(
    context: DeliveryContext,
    deliverableId: number,
    milestoneId: number,
  ): Promise<readonly Row[]> {
    const versions = await this.query
      .selectFrom('cdDeliverableVersions')
      .selectAll()
      .where('deliverableId', '=', deliverableId)
      .orderBy('versionNo', 'desc')
      .execute();
    const names = await this.userNameMap();
    const canAccept = canAcceptMilestone(context.scope, milestoneId);
    const result = [];
    for (const version of versions) {
      result.push({
        ...version,
        submittedByName: names.get(str(version.submittedById)) ?? '',
        reviewerName: names.get(str(version.reviewerId)) ?? '',
        files: await this.listFiles(context, 'deliverable', num(version.id)),
        canAccept: canAccept && str(version.status) === 'pending_review',
        canWithdraw: str(version.status) === 'pending_review',
      });
    }
    return result;
  }

  async listVersions(
    context: DeliveryContext,
    deliverableId: number,
  ): Promise<readonly Row[]> {
    const deliverable = await this.loadDeliverableForRead(
      context,
      deliverableId,
    );
    return this.listVersionsForDeliverable(
      context,
      deliverableId,
      num(deliverable.milestoneId),
    );
  }

  private async loadDeliverableForRead(
    context: DeliveryContext,
    deliverableId: number,
  ): Promise<Row> {
    const deliverable = await this.query
      .selectFrom('cdDeliverables')
      .selectAll()
      .where('id', '=', deliverableId)
      .executeTakeFirst();
    if (!deliverable) throw notFound('Deliverable not found.');
    const milestone = await this.loadMilestone(num(deliverable.milestoneId));
    await this.assertContractReadable(context, num(milestone.contractId));
    return deliverable;
  }

  async submitVersion(
    context: DeliveryContext,
    deliverableId: number,
    input: Row,
  ): Promise<Row> {
    const deliverable = await this.loadDeliverableForRead(
      context,
      deliverableId,
    );
    const milestone = await this.loadMilestone(num(deliverable.milestoneId));
    await this.assertContractWritable(context, num(milestone.contractId));
    if (str(milestone.status) === 'accepted') {
      throw conflict(
        'MILESTONE_ACCEPTED',
        'This milestone is already accepted.',
      );
    }
    const fileIds = Array.isArray(input.fileIds)
      ? input.fileIds.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    if (!fileIds.length) {
      throw badRequest(
        'FILES_REQUIRED',
        'At least one deliverable file is required.',
      );
    }
    await this.assertFilesAvailable('deliverable', fileIds);
    const nextVersion = num(deliverable.currentVersion) + 1;
    const now = timestamp();
    const versionId = await this.nextId('cdDeliverableVersions');
    await this.query
      .insertInto('cdDeliverableVersions')
      .values({
        id: versionId,
        deliverableId,
        versionNo: nextVersion,
        status: 'pending_review',
        note: optionalText(input.note, 2000),
        submittedById: context.actor.userId,
        submittedAt: now,
        reviewerId: str(milestone.acceptorId) || null,
        reviewedAt: null,
        reviewComment: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await this.attachFiles(context, 'deliverable', versionId, fileIds);
    await this.query
      .updateTable('cdDeliverables')
      .set({
        currentVersion: nextVersion,
        status: 'pending_review',
        updatedAt: now,
      })
      .where('id', '=', deliverableId)
      .execute();
    if (str(milestone.status) !== 'delivered') {
      await this.query
        .updateTable('cdMilestones')
        .set({ status: 'delivered', updatedAt: now })
        .where('id', '=', num(milestone.id))
        .execute();
    }
    const versions = await this.listVersionsForDeliverable(
      context,
      deliverableId,
      num(milestone.id),
    );
    return (
      versions.find((row) => num(row.id) === versionId) ?? versions[0] ?? {}
    );
  }

  private async loadVersionForRead(
    context: DeliveryContext,
    versionId: number,
  ): Promise<{ version: Row; deliverable: Row; milestone: Row }> {
    const version = await this.query
      .selectFrom('cdDeliverableVersions')
      .selectAll()
      .where('id', '=', versionId)
      .executeTakeFirst();
    if (!version) throw notFound('Version not found.');
    const deliverable = await this.query
      .selectFrom('cdDeliverables')
      .selectAll()
      .where('id', '=', num(version.deliverableId))
      .executeTakeFirst();
    if (!deliverable) throw notFound('Deliverable not found.');
    const milestone = await this.loadMilestone(num(deliverable.milestoneId));
    await this.assertContractReadable(context, num(milestone.contractId));
    return { version: version, deliverable: deliverable, milestone };
  }

  async approveVersion(
    context: DeliveryContext,
    versionId: number,
    comment: unknown,
  ): Promise<Row> {
    const { version, deliverable, milestone } = await this.loadVersionForRead(
      context,
      versionId,
    );
    const milestoneId = num(milestone.id);
    if (!canAcceptMilestone(context.scope, milestoneId)) {
      throw forbidden(
        'Only the assigned acceptance specialist can approve this delivery.',
      );
    }
    const status = str(version.status);
    if (status === 'withdrawn') {
      throw conflict(
        'VERSION_WITHDRAWN',
        'A withdrawn version cannot be approved.',
      );
    }
    if (status === 'approved') {
      throw conflict('ALREADY_APPROVED', 'This version is already approved.');
    }
    const now = timestamp();
    await this.query
      .updateTable('cdDeliverableVersions')
      .set({
        status: 'approved',
        reviewerId: context.actor.userId,
        reviewedAt: now,
        reviewComment: optionalText(comment, 2000),
        updatedAt: now,
      })
      .where('id', '=', versionId)
      .execute();
    await this.query
      .updateTable('cdDeliverables')
      .set({ status: 'approved', updatedAt: now })
      .where('id', '=', num(deliverable.id))
      .execute();
    await this.query
      .updateTable('cdMilestones')
      .set({ status: 'accepted', updatedAt: now })
      .where('id', '=', milestoneId)
      .execute();
    // Acceptance is what unlocks the receivable; a second confirmation never duplicates it.
    const receivable = await this.confirmReceivable(context, milestoneId, true);
    return { versionId, receivable };
  }

  async returnVersion(
    context: DeliveryContext,
    versionId: number,
    comment: unknown,
  ): Promise<Row> {
    const { version, deliverable, milestone } = await this.loadVersionForRead(
      context,
      versionId,
    );
    if (!canAcceptMilestone(context.scope, num(milestone.id))) {
      throw forbidden(
        'Only the assigned acceptance specialist can return this delivery.',
      );
    }
    if (str(version.status) === 'withdrawn') {
      throw conflict(
        'VERSION_WITHDRAWN',
        'A withdrawn version cannot be returned.',
      );
    }
    const reason = optionalText(comment, 2000);
    if (!reason) {
      throw badRequest(
        'REASON_REQUIRED',
        'A reason is required when returning a delivery.',
      );
    }
    const now = timestamp();
    await this.query
      .updateTable('cdDeliverableVersions')
      .set({
        status: 'returned',
        reviewerId: context.actor.userId,
        reviewedAt: now,
        reviewComment: reason,
        updatedAt: now,
      })
      .where('id', '=', versionId)
      .execute();
    await this.query
      .updateTable('cdDeliverables')
      .set({ status: 'returned', updatedAt: now })
      .where('id', '=', num(deliverable.id))
      .execute();
    if (str(milestone.status) === 'accepted') {
      await this.query
        .updateTable('cdMilestones')
        .set({ status: 'delivered', updatedAt: now })
        .where('id', '=', num(milestone.id))
        .execute();
    }
    return { versionId };
  }

  async withdrawVersion(
    context: DeliveryContext,
    versionId: number,
  ): Promise<Row> {
    const { version, deliverable, milestone } = await this.loadVersionForRead(
      context,
      versionId,
    );
    const isSubmitter = str(version.submittedById) === context.actor.userId;
    if (
      !isSubmitter &&
      !canManageContract(context.scope, num(milestone.contractId))
    ) {
      throw forbidden('You cannot withdraw this version.');
    }
    if (str(version.status) !== 'pending_review') {
      throw conflict(
        'NOT_PENDING',
        'Only a version waiting for review can be withdrawn.',
      );
    }
    const now = timestamp();
    await this.query
      .updateTable('cdDeliverableVersions')
      .set({ status: 'withdrawn', updatedAt: now })
      .where('id', '=', versionId)
      .execute();
    await this.query
      .updateTable('cdDeliverables')
      .set({ status: 'draft', updatedAt: now })
      .where('id', '=', num(deliverable.id))
      .execute();
    return { versionId };
  }

  async acceptanceQueue(context: DeliveryContext): Promise<readonly Row[]> {
    const versions = await this.query
      .selectFrom('cdDeliverableVersions')
      .selectAll()
      .where('status', '=', 'pending_review')
      .orderBy('submittedAt', 'asc')
      .execute();
    const names = await this.userNameMap();
    const items = [];
    for (const version of versions) {
      const deliverable = await this.query
        .selectFrom('cdDeliverables')
        .selectAll()
        .where('id', '=', num(version.deliverableId))
        .executeTakeFirst();
      if (!deliverable) continue;
      const deliverableRow = deliverable;
      const milestone = await this.loadMilestone(
        num(deliverableRow.milestoneId),
      );
      const contractId = num(milestone.contractId);
      if (!canReadContract(context.scope, contractId)) continue;
      const contract = await this.query
        .selectFrom('cdContracts')
        .select(['id', 'contractNo', 'title'])
        .where('id', '=', contractId)
        .executeTakeFirst();
      items.push({
        versionId: num(version.id),
        versionNo: num(version.versionNo),
        submittedAt: version.submittedAt,
        submittedByName: names.get(str(version.submittedById)) ?? '',
        note: version.note,
        deliverableId: num(deliverableRow.id),
        deliverableName: str(deliverableRow.name),
        milestoneId: num(milestone.id),
        milestoneName: str(milestone.name),
        contractId,
        contractNo: str(contract?.contractNo),
        contractTitle: str(contract?.title),
        acceptorName: names.get(str(milestone.acceptorId)) ?? '',
        canAccept: canAcceptMilestone(context.scope, num(milestone.id)),
        files: await this.listFiles(context, 'deliverable', num(version.id)),
      });
    }
    return items;
  }

  // ------------------------------------------------- receivables, payments

  async confirmReceivable(
    context: DeliveryContext,
    milestoneId: number,
    internal = false,
  ): Promise<Row | null> {
    const milestone = await this.loadMilestone(milestoneId);
    await this.assertContractReadable(context, num(milestone.contractId));
    if (!internal && !canManageMoney(context.actor)) {
      throw forbidden('Only finance can confirm a receivable.');
    }
    if (str(milestone.status) !== 'accepted') {
      throw conflict(
        'MILESTONE_NOT_ACCEPTED',
        'A receivable can only be created for an accepted milestone.',
      );
    }
    const existing = await this.query
      .selectFrom('cdReceivables')
      .selectAll()
      .where('milestoneId', '=', milestoneId)
      .executeTakeFirst();
    if (existing) return existing;
    if (num(milestone.amountCents) <= 0) {
      throw badRequest(
        'ZERO_AMOUNT',
        'This milestone has no amount to invoice.',
      );
    }
    const now = timestamp();
    const id = await this.nextId('cdReceivables');
    await this.query
      .insertInto('cdReceivables')
      .values({
        id,
        contractId: num(milestone.contractId),
        milestoneId,
        amountCents: num(milestone.amountCents),
        receivedCents: 0,
        status: 'unpaid',
        confirmedById: context.actor.userId,
        confirmedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return this.query
      .selectFrom('cdReceivables')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst() as Promise<Row>;
  }

  async listReceivables(
    context: DeliveryContext,
    input: {
      status?: string;
      contractId?: unknown;
      page?: unknown;
      pageSize?: unknown;
    },
  ): Promise<Paged<Row>> {
    const page = normalizePage(input.page, 1);
    const pageSize = Math.min(normalizePage(input.pageSize, 20), 100);
    let builder = this.query
      .selectFrom('cdReceivables')
      .selectAll()
      .orderBy('id', 'desc')
      .limit(pageSize + 1)
      .offset((page - 1) * pageSize);
    if (!context.scope.readAll) {
      const ids = [...context.scope.readableContractIds];
      if (!ids.length) return pageList([], page, pageSize);
      builder = builder.where('contractId', 'in', ids);
    }
    if (input.status && input.status !== 'all') {
      builder = builder.where('status', '=', input.status);
    }
    const contractId = intOrNull(input.contractId);
    if (contractId !== null)
      builder = builder.where('contractId', '=', contractId);
    const rows = await builder.execute();
    const paged = pageList(rows, page, pageSize);
    const items = [];
    for (const row of paged.items) {
      const contract = await this.query
        .selectFrom('cdContracts')
        .select(['id', 'contractNo', 'title'])
        .where('id', '=', num(row.contractId))
        .executeTakeFirst();
      const milestone = await this.query
        .selectFrom('cdMilestones')
        .select(['id', 'name', 'dueDate'])
        .where('id', '=', num(row.milestoneId))
        .executeTakeFirst();
      items.push({
        ...row,
        outstandingCents: num(row.amountCents) - num(row.receivedCents),
        contractNo: str(contract?.contractNo),
        contractTitle: str(contract?.title),
        milestoneName: str(milestone?.name),
        milestoneDueDate: str(milestone?.dueDate),
        isOverdue:
          str(row.status) !== 'paid' &&
          Boolean(milestone) &&
          str(milestone?.dueDate) < today(),
      });
    }
    return { ...paged, items };
  }

  async getReceivable(
    context: DeliveryContext,
    receivableId: number,
  ): Promise<Row> {
    const receivable = await this.query
      .selectFrom('cdReceivables')
      .selectAll()
      .where('id', '=', receivableId)
      .executeTakeFirst();
    if (!receivable) throw notFound('Receivable not found.');
    const receivableRow = receivable;
    await this.assertContractReadable(context, num(receivableRow.contractId));
    const payments = await this.query
      .selectFrom('cdPayments')
      .selectAll()
      .where('receivableId', '=', receivableId)
      .orderBy('receivedAt', 'desc')
      .orderBy('id', 'desc')
      .execute();
    const names = await this.userNameMap();
    const paymentItems = [];
    for (const payment of payments) {
      paymentItems.push({
        ...payment,
        createdByName: names.get(str(payment.createdById)) ?? '',
        files: await this.listFiles(context, 'payment', num(payment.id)),
      });
    }
    const contract = await this.query
      .selectFrom('cdContracts')
      .select(['id', 'contractNo', 'title', 'customerId'])
      .where('id', '=', num(receivableRow.contractId))
      .executeTakeFirst();
    const milestone = await this.query
      .selectFrom('cdMilestones')
      .select(['id', 'name', 'dueDate', 'acceptorId'])
      .where('id', '=', num(receivableRow.milestoneId))
      .executeTakeFirst();
    return {
      receivable: {
        ...receivableRow,
        outstandingCents:
          num(receivableRow.amountCents) - num(receivableRow.receivedCents),
      },
      contract: contract ?? null,
      milestone: milestone ?? null,
      payments: paymentItems,
      canManageMoney: canManageMoney(context.actor),
    };
  }

  async registerPayment(
    context: DeliveryContext,
    receivableId: number,
    input: Row,
  ): Promise<Row> {
    if (!canManageMoney(context.actor)) {
      throw forbidden('Only finance can register a payment.');
    }
    const receivable = await this.query
      .selectFrom('cdReceivables')
      .selectAll()
      .where('id', '=', receivableId)
      .executeTakeFirst();
    if (!receivable) throw notFound('Receivable not found.');
    const receivableRow = receivable;
    await this.assertContractReadable(context, num(receivableRow.contractId));
    const amountCents = requireInteger(input.amountCents, 'Payment amount');
    if (amountCents <= 0) {
      throw badRequest(
        'INVALID_AMOUNT',
        'A payment must be greater than zero.',
      );
    }
    const outstanding =
      num(receivableRow.amountCents) - num(receivableRow.receivedCents);
    if (amountCents > outstanding) {
      throw badRequest(
        'OVERPAYMENT',
        'A payment cannot exceed the outstanding balance.',
      );
    }
    const method = optionalText(input.method, 32) ?? 'transfer';
    if (!(PAYMENT_METHODS as readonly string[]).includes(method)) {
      throw badRequest('INVALID_METHOD', 'Unknown payment method.');
    }
    const fileIds = Array.isArray(input.fileIds)
      ? input.fileIds.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    if (fileIds.length) await this.assertFilesAvailable('payment', fileIds);
    const now = timestamp();
    const id = await this.nextId('cdPayments');
    await this.query
      .insertInto('cdPayments')
      .values({
        id,
        receivableId,
        amountCents,
        receivedAt: requireText(input.receivedAt, 'Received date', 20),
        method,
        note: optionalText(input.note),
        createdById: context.actor.userId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    if (fileIds.length) await this.attachFiles(context, 'payment', id, fileIds);
    const receivedCents = num(receivableRow.receivedCents) + amountCents;
    const status =
      receivedCents >= num(receivableRow.amountCents) ? 'paid' : 'partial';
    await this.query
      .updateTable('cdReceivables')
      .set({ receivedCents, status, updatedAt: now })
      .where('id', '=', receivableId)
      .execute();
    return this.getReceivable(context, receivableId);
  }

  // ----------------------------------------------------------------- files

  private exposure(kind: FileKind) {
    const exposure = FILE_EXPOSURES.find((item) => item.kind === kind);
    if (!exposure) throw badRequest('UNKNOWN_FILE_KIND', 'Unknown file kind.');
    return exposure;
  }

  async listFiles(
    context: DeliveryContext,
    kind: FileKind,
    targetId: number,
  ): Promise<readonly Row[]> {
    void context;
    const exposure = this.exposure(kind);
    const links = await this.query
      .selectFrom('cdFileLinks')
      .selectAll()
      .where('fileKind', '=', kind)
      .where('targetType', '=', exposure.targetType)
      .where('targetId', '=', targetId)
      .orderBy('id', 'asc')
      .execute();
    if (!links.length) return [];
    const ids = links.map((link) => str(link.fileId));
    const records = await this.query
      .selectFrom(exposure.collection)
      .select([
        'id',
        'filename',
        'ext',
        'mimeType',
        'size',
        'createdAt',
        'uploadedById',
        'uploadedByName',
      ])
      .where('id', 'in', ids)
      .execute();
    const byId = new Map(records.map((record) => [str(record.id), record]));
    const names = await this.userNameMap();
    return ids
      .map((id) => byId.get(id))
      .filter((record): record is Row => Boolean(record))
      .map((record) => this.decorateFile(kind, record, names));
  }

  private decorateFile(
    kind: FileKind,
    record: Row,
    names: Map<string, string>,
  ): Row {
    const exposure = this.exposure(kind);
    const id = str(record.id);
    const ext = str(record.ext);
    const uploadedById = str(record.uploadedById);
    return {
      ...record,
      fileKind: kind,
      contentUrl: `${this.basePath}${exposure.accessPath}/${encodeURIComponent(id)}${
        ext ? `.${encodeURIComponent(ext)}` : ''
      }`,
      uploadedByName:
        names.get(uploadedById) || str(record.uploadedByName) || uploadedById,
    };
  }

  private async assertFilesAvailable(
    kind: FileKind,
    fileIds: readonly string[],
  ): Promise<void> {
    if (!fileIds.length) return;
    if (fileIds.length > MAX_FILES_PER_UPLOAD) {
      throw badRequest(
        'TOO_MANY_FILES',
        `At most ${MAX_FILES_PER_UPLOAD} files can be attached at once.`,
      );
    }
    const exposure = this.exposure(kind);
    const records = await this.query
      .selectFrom(exposure.collection)
      .select(['id', 'size'])
      .where('id', 'in', [...fileIds])
      .execute();
    if (records.length !== new Set(fileIds).size) {
      throw badRequest(
        'UNKNOWN_FILE',
        'One of the uploaded files no longer exists.',
      );
    }
    const oversized = records.find(
      (record) => num(record.size) > MAX_FILE_BYTES,
    );
    if (oversized) {
      throw badRequest('FILE_TOO_LARGE', 'A file may not exceed 20 MB.');
    }
    const linked = await this.query
      .selectFrom('cdFileLinks')
      .select('fileId')
      .where('fileId', 'in', [...fileIds])
      .execute();
    if (linked.length) {
      throw conflict(
        'FILE_ALREADY_LINKED',
        'A file can only belong to one business record.',
      );
    }
  }

  async attachFiles(
    context: DeliveryContext,
    kind: FileKind,
    targetId: number,
    fileIds: readonly string[],
  ): Promise<void> {
    const exposure = this.exposure(kind);
    const now = timestamp();
    for (const fileId of fileIds) {
      await this.query
        .insertInto('cdFileLinks')
        .values({
          fileKind: kind,
          fileId,
          targetType: exposure.targetType,
          targetId,
          createdById: context.actor.userId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  }

  /** Attach already-uploaded files to a contract attachment list. */
  async linkContractFiles(
    context: DeliveryContext,
    contractId: number,
    fileIds: readonly string[],
  ): Promise<readonly Row[]> {
    if (!fileIds.length)
      throw badRequest('FILES_REQUIRED', 'Select at least one file.');
    await this.assertContractWritable(context, contractId);
    await this.assertFilesAvailable('contract', fileIds);
    await this.attachFiles(context, 'contract', contractId, fileIds);
    return this.listFiles(context, 'contract', contractId);
  }

  /** Attach receipt files to a payment. */
  async linkPaymentFiles(
    context: DeliveryContext,
    paymentId: number,
    fileIds: readonly string[],
  ): Promise<readonly Row[]> {
    if (!fileIds.length)
      throw badRequest('FILES_REQUIRED', 'Select at least one file.');
    if (!canManageMoney(context.actor))
      throw forbidden('Only finance can attach receipts.');
    const payment = await this.query
      .selectFrom('cdPayments')
      .select('receivableId')
      .where('id', '=', paymentId)
      .executeTakeFirst();
    if (!payment) throw notFound('Payment not found.');
    const receivable = await this.query
      .selectFrom('cdReceivables')
      .select('contractId')
      .where('id', '=', num(payment.receivableId))
      .executeTakeFirst();
    await this.assertContractReadable(context, num(receivable?.contractId));
    await this.assertFilesAvailable('payment', fileIds);
    await this.attachFiles(context, 'payment', paymentId, fileIds);
    return this.listFiles(context, 'payment', paymentId);
  }

  async renameFile(
    context: DeliveryContext,
    kind: FileKind,
    fileId: string,
    filename: unknown,
  ): Promise<readonly Row[]> {
    const owner = await this.loadFileOwner(kind, fileId);
    await this.assertFileWritable(context, owner.contractId);
    const next = requireText(filename, 'File name', 200);
    await this.query
      .updateTable(this.exposure(kind).collection)
      .set({ filename: next, updatedAt: timestamp() })
      .where('id', '=', fileId)
      .execute();
    return this.listFiles(context, kind, owner.targetId);
  }

  async removeFile(
    context: DeliveryContext,
    kind: FileKind,
    fileId: string,
  ): Promise<void> {
    const owner = await this.loadFileOwner(kind, fileId);
    await this.assertFileWritable(context, owner.contractId);
    await this.query
      .deleteFrom('cdFileLinks')
      .where('fileId', '=', fileId)
      .where('fileKind', '=', kind)
      .execute();
    await this.query
      .deleteFrom(this.exposure(kind).collection)
      .where('id', '=', fileId)
      .execute();
  }

  private async assertFileWritable(
    context: DeliveryContext,
    contractId: number,
  ): Promise<void> {
    await this.assertContractReadable(context, contractId);
    if (!canManageContract(context.scope, contractId)) {
      throw forbidden('You cannot change files of this contract.');
    }
  }

  /** Resolve which contract a file belongs to, through its business link. */
  async loadFileOwner(
    kind: FileKind,
    fileId: string,
  ): Promise<{ contractId: number; targetId: number }> {
    const exposure = this.exposure(kind);
    const link = await this.query
      .selectFrom('cdFileLinks')
      .selectAll()
      .where('fileKind', '=', kind)
      .where('fileId', '=', fileId)
      .orderBy('id', 'asc')
      .executeTakeFirst();
    if (!link) throw notFound('File link not found.');
    const targetId = num(link.targetId);
    const contractId = await this.contractIdForTarget(
      exposure.targetType,
      targetId,
    );
    return { contractId, targetId };
  }

  private async contractIdForTarget(
    targetType: 'contract' | 'version' | 'payment',
    targetId: number,
  ): Promise<number> {
    if (targetType === 'contract') return targetId;
    if (targetType === 'version') {
      const version = await this.query
        .selectFrom('cdDeliverableVersions')
        .select('deliverableId')
        .where('id', '=', targetId)
        .executeTakeFirst();
      if (!version) throw notFound('Version not found.');
      const deliverable = await this.query
        .selectFrom('cdDeliverables')
        .select('milestoneId')
        .where('id', '=', num(version.deliverableId))
        .executeTakeFirst();
      if (!deliverable) throw notFound('Deliverable not found.');
      const milestone = await this.query
        .selectFrom('cdMilestones')
        .select('contractId')
        .where('id', '=', num(deliverable.milestoneId))
        .executeTakeFirst();
      if (!milestone) throw notFound('Milestone not found.');
      return num(milestone.contractId);
    }
    const payment = await this.query
      .selectFrom('cdPayments')
      .select('receivableId')
      .where('id', '=', targetId)
      .executeTakeFirst();
    if (!payment) throw notFound('Payment not found.');
    const receivable = await this.query
      .selectFrom('cdReceivables')
      .select('contractId')
      .where('id', '=', num(payment.receivableId))
      .executeTakeFirst();
    if (!receivable) throw notFound('Receivable not found.');
    return num(receivable.contractId);
  }

  /** Authorization check used by the file content route before bytes are served. */
  async assertFileReadable(
    actor: Actor,
    kind: FileKind,
    fileId: string,
  ): Promise<void> {
    const scope = await resolveContractScope(this.query, actor);
    const owner = await this.loadFileOwner(kind, fileId);
    if (!canReadContract(scope, owner.contractId)) {
      throw forbidden('This file belongs to a contract outside your scope.');
    }
  }

  // ------------------------------------------------------------- dashboard

  async dashboard(context: DeliveryContext): Promise<Row> {
    const scope = context.scope;
    const contracts = (await this.scopedContracts(scope)) as Row[];
    if (!scope.readAll && scope.readableContractIds.size === 0) {
      return {
        cards: {
          pendingReview: 0,
          overdueMilestones: 0,
          activeContracts: 0,
          outstandingCents: 0,
          acceptedMilestones: 0,
          totalMilestones: 0,
        },
        pendingReview: [],
        overdueMilestones: [],
        contracts: [],
      };
    }
    const contractIds = new Set(contracts.map((row) => num(row.id)));

    const milestoneRows = await this.query
      .selectFrom('cdMilestones')
      .selectAll()
      .orderBy('dueDate', 'asc')
      .execute();
    const scopedMilestones = milestoneRows.filter((row) =>
      contractIds.has(num(row.contractId)),
    );

    const receivableRows = await this.query
      .selectFrom('cdReceivables')
      .selectAll()
      .execute();
    const scopedReceivables = receivableRows.filter((row) =>
      contractIds.has(num(row.contractId)),
    );

    const queue = await this.acceptanceQueue(context);
    const pendingReview = queue.filter((item) => item.canAccept);
    const overdue = scopedMilestones
      .filter(
        (row) => str(row.status) !== 'accepted' && str(row.dueDate) < today(),
      )
      .map((row) => ({
        id: num(row.id),
        name: str(row.name),
        dueDate: str(row.dueDate),
        status: str(row.status),
        contractId: num(row.contractId),
        contractNo: str(
          contracts.find((contract) => num(contract.id) === num(row.contractId))
            ?.contractNo,
        ),
        amountCents: num(row.amountCents),
      }));

    const acceptedMilestones = scopedMilestones.filter(
      (row) => str(row.status) === 'accepted',
    ).length;
    const outstandingCents = scopedReceivables.reduce(
      (total, row) => total + num(row.amountCents) - num(row.receivedCents),
      0,
    );

    const names = await this.userNameMap();
    const contractSummaries = [];
    for (const contract of contracts) {
      contractSummaries.push({
        id: num(contract.id),
        contractNo: str(contract.contractNo),
        title: str(contract.title),
        status: str(contract.status),
        endDate: str(contract.endDate),
        amountCents: num(contract.amountCents),
        managerName: names.get(str(contract.managerId)) ?? '',
        ...(await this.contractProgress(num(contract.id))),
      });
    }

    return {
      cards: {
        pendingReview: pendingReview.length,
        overdueMilestones: overdue.length,
        activeContracts: contracts.filter((row) =>
          ['active', 'performing'].includes(str(row.status)),
        ).length,
        outstandingCents,
        acceptedMilestones,
        totalMilestones: scopedMilestones.length,
      },
      pendingReview: pendingReview.slice(0, 8),
      overdueMilestones: overdue.slice(0, 8),
      contracts: contractSummaries
        .sort((left, right) => right.progressPercent - left.progressPercent)
        .slice(0, 6),
    };
  }

  private async scopedContracts(scope: ContractScope): Promise<readonly Row[]> {
    let builder = this.query
      .selectFrom('cdContracts')
      .select([
        'id',
        'status',
        'amountCents',
        'endDate',
        'contractNo',
        'title',
        'managerId',
      ])
      .orderBy('id', 'desc');
    if (!scope.readAll) {
      const ids = [...scope.readableContractIds];
      if (!ids.length) return [];
      builder = builder.where('id', 'in', ids);
    }
    return await builder.execute();
  }
}

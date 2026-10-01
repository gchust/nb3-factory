import type { DatabaseManager, FilterNode } from '@nocobase/db';
import type { AccessService } from './access-service.js';
import {
  invalid,
  notFound,
  type CustomerRow,
  type DeviceRow,
  type ServiceActor,
  type UserRow,
} from './contracts.js';

export interface CustomerInput {
  name: string;
  contactName?: string;
  contactPhone?: string;
  address?: string;
  note?: string;
}

export interface DeviceInput {
  code: string;
  name: string;
  model?: string;
  serialNo?: string;
  customerId: number;
  engineerId?: string | null;
  enabled?: boolean;
  nextInspectionDate?: string | null;
}

/** A device update may change any subset of the fields. */
export type UpdateDeviceInput = Partial<DeviceInput>;

export interface EngineerView {
  id: string;
  name: string;
  username?: string | null;
  email?: string | null;
}

export interface DeviceView extends DeviceRow {
  customerName?: string | null;
  engineerName?: string | null;
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value.slice(0, 10);
}

/**
 * Customer and device ledgers, plus the engineer roster used by assignment UI.
 *
 * Staff read the ledger; only the supervisor changes it.
 */
export class LedgerService {
  private readonly db: DatabaseManager;
  private readonly access: AccessService;

  constructor(db: DatabaseManager, access: AccessService) {
    this.db = db;
    this.access = access;
  }

  // ------------------------------------------------------------ customers

  async listCustomers(
    actor: ServiceActor,
    keyword?: string,
  ): Promise<CustomerRow[]> {
    this.access.assertCanReadLedger(actor);
    return this.db.repository<CustomerRow>('serviceCustomers').findMany({
      filter: (filter) => {
        if (!keyword || !keyword.trim()) {
          return filter.and([]);
        }
        const term = keyword.trim();
        return filter.or([
          filter.string('name').includes(term, { mode: 'insensitive' }),
          filter.string('contactName').includes(term, { mode: 'insensitive' }),
          filter.string('contactPhone').includes(term, { mode: 'insensitive' }),
        ]);
      },
      sort: (sort) => sort.field('name').asc(),
    });
  }

  async createCustomer(
    actor: ServiceActor,
    input: CustomerInput,
  ): Promise<CustomerRow> {
    this.access.assertSupervisor(actor);
    if (!input.name || !input.name.trim()) {
      throw invalid('A customer name is required.');
    }
    const now = new Date();
    const { record } = await this.db
      .repository<CustomerRow>('serviceCustomers')
      .createOne({
        values: {
          name: input.name.trim(),
          contactName: input.contactName ?? null,
          contactPhone: input.contactPhone ?? null,
          address: input.address ?? null,
          note: input.note ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });
    return record;
  }

  async updateCustomer(
    actor: ServiceActor,
    id: number,
    input: CustomerInput,
  ): Promise<CustomerRow> {
    this.access.assertSupervisor(actor);
    const existing = await this.db
      .repository<CustomerRow>('serviceCustomers')
      .findOne({ filter: { id } });
    if (!existing) {
      throw notFound('The customer does not exist.');
    }
    await this.db.repository<CustomerRow>('serviceCustomers').updateOne({
      filter: { id },
      values: {
        name: input.name ?? existing.name,
        contactName: input.contactName ?? existing.contactName ?? null,
        contactPhone: input.contactPhone ?? existing.contactPhone ?? null,
        address: input.address ?? existing.address ?? null,
        note: input.note ?? existing.note ?? null,
        updatedAt: new Date(),
      },
    });
    return (await this.db
      .repository<CustomerRow>('serviceCustomers')
      .findOne({ filter: { id } }))!;
  }

  // -------------------------------------------------------------- devices

  async listDevices(
    actor: ServiceActor,
    query: {
      customerId?: number;
      engineerId?: string;
      enabled?: boolean;
      keyword?: string;
    } = {},
  ): Promise<DeviceView[]> {
    this.access.assertCanReadLedger(actor);
    const rows = await this.db
      .repository<DeviceRow>('serviceDevices')
      .findMany({
        filter: (filter) => {
          const items: FilterNode[] = [];
          if (query.customerId !== undefined) {
            items.push(filter.number('customerId').eq(query.customerId));
          }
          if (query.engineerId) {
            items.push(filter.string('engineerId').eq(query.engineerId));
          }
          if (query.enabled !== undefined) {
            items.push(
              query.enabled
                ? filter.boolean('enabled').isTrue()
                : filter.boolean('enabled').isFalse(),
            );
          }
          if (query.keyword && query.keyword.trim()) {
            const term = query.keyword.trim();
            items.push(
              filter.or([
                filter.string('code').includes(term, { mode: 'insensitive' }),
                filter.string('name').includes(term, { mode: 'insensitive' }),
                filter
                  .string('serialNo')
                  .includes(term, { mode: 'insensitive' }),
              ]),
            );
          }
          return filter.and(items);
        },
        sort: (sort) => sort.field('code').asc(),
      });
    return this.decorate(rows);
  }

  async getDevice(actor: ServiceActor, id: number): Promise<DeviceView> {
    this.access.assertCanReadLedger(actor);
    const row = await this.db
      .repository<DeviceRow>('serviceDevices')
      .findOne({ filter: { id } });
    if (!row) {
      throw notFound('The device does not exist.');
    }
    const [view] = await this.decorate([row]);
    return view;
  }

  async createDevice(
    actor: ServiceActor,
    input: DeviceInput,
  ): Promise<DeviceView> {
    this.access.assertSupervisor(actor);
    if (!input.code || !input.code.trim()) {
      throw invalid('A unique device code is required.');
    }
    if (!input.name || !input.name.trim()) {
      throw invalid('A device name is required.');
    }
    const customer = await this.db
      .repository<CustomerRow>('serviceCustomers')
      .findOne({ filter: { id: input.customerId } });
    if (!customer) {
      throw invalid('The selected customer does not exist.');
    }
    const duplicate = await this.db
      .repository<DeviceRow>('serviceDevices')
      .findOne({ filter: { code: input.code.trim() } });
    if (duplicate) {
      throw invalid('That device code is already in use.');
    }
    const now = new Date();
    const { record } = await this.db
      .repository<DeviceRow>('serviceDevices')
      .createOne({
        values: {
          code: input.code.trim(),
          name: input.name.trim(),
          model: input.model ?? null,
          serialNo: input.serialNo ?? null,
          customerId: input.customerId,
          engineerId: input.engineerId ?? null,
          enabled: input.enabled ?? true,
          nextInspectionDate: normalizeDate(input.nextInspectionDate),
          lastInspectionDate: null,
          createdAt: now,
          updatedAt: now,
        },
      });
    const [view] = await this.decorate([record]);
    return view;
  }

  async updateDevice(
    actor: ServiceActor,
    id: number,
    input: UpdateDeviceInput,
  ): Promise<DeviceView> {
    this.access.assertSupervisor(actor);
    const existing = await this.db
      .repository<DeviceRow>('serviceDevices')
      .findOne({ filter: { id } });
    if (!existing) {
      throw notFound('The device does not exist.');
    }
    if (input.code && input.code.trim() !== existing.code) {
      const duplicate = await this.db
        .repository<DeviceRow>('serviceDevices')
        .findOne({ filter: { code: input.code.trim() } });
      if (duplicate) {
        throw invalid('That device code is already in use.');
      }
    }
    await this.db.repository<DeviceRow>('serviceDevices').updateOne({
      filter: { id },
      values: {
        code: input.code?.trim() ?? existing.code,
        name: input.name?.trim() ?? existing.name,
        model: input.model ?? existing.model ?? null,
        serialNo: input.serialNo ?? existing.serialNo ?? null,
        customerId: input.customerId ?? existing.customerId,
        engineerId:
          input.engineerId === undefined
            ? (existing.engineerId ?? null)
            : input.engineerId,
        enabled: input.enabled ?? existing.enabled,
        nextInspectionDate:
          input.nextInspectionDate === undefined
            ? (existing.nextInspectionDate ?? null)
            : normalizeDate(input.nextInspectionDate),
        updatedAt: new Date(),
      },
    });
    return this.getDevice(actor, id);
  }

  // ------------------------------------------------------ engineer roster

  /** The engineers an assignment or share may point at. */
  async listEngineers(actor: ServiceActor): Promise<EngineerView[]> {
    this.access.assertCanReadLedger(actor);
    const engineerIds = await this.access.listUserIdsByRole('engineer');
    const supervisors = await this.access.listUserIdsByRole('supervisor');
    const ids = [...new Set([...engineerIds, ...supervisors])];
    if (!ids.length) {
      return [];
    }
    const users = await this.db.repository<UserRow>('user').findMany({});
    return users
      .filter((user) => ids.includes(user.id))
      .map((user) => ({
        id: user.id,
        name: user.name,
        username: user.username ?? null,
        email: user.email ?? null,
      }));
  }

  /** Every enabled device an engineer is responsible for. */
  async listEngineerDevices(engineerId: string): Promise<DeviceRow[]> {
    return this.db.repository<DeviceRow>('serviceDevices').findMany({
      filter: (filter) =>
        filter.and([
          filter.string('engineerId').eq(engineerId),
          filter.boolean('enabled').isTrue(),
        ]),
      sort: (sort) => sort.field('code').asc(),
    });
  }

  private async decorate(rows: DeviceRow[]): Promise<DeviceView[]> {
    if (!rows.length) {
      return [];
    }
    const customers = await this.db
      .repository<CustomerRow>('serviceCustomers')
      .findMany({});
    const customerById = new Map(
      customers.map((customer) => [customer.id, customer]),
    );
    const users = await this.db.repository<UserRow>('user').findMany({});
    const userById = new Map(users.map((user) => [user.id, user]));
    return rows.map((row) => ({
      ...row,
      customerName: customerById.get(row.customerId)?.name ?? null,
      engineerName: row.engineerId
        ? (userById.get(row.engineerId)?.name ?? null)
        : null,
    }));
  }
}

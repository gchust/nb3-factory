import type { DatabaseManager } from '@nocobase/db';
import type { FilterBuilder } from '@nocobase/repository-input';

import {
  authorizeCompositeAction,
  scopedRepository,
  type RequestServiceContext,
} from './context.js';
import { conflict, invalid, notFound } from './errors.js';
import type { CustomerRow, DeviceRow, ServiceGroupRow } from './types.js';

export interface Page<T> {
  readonly rows: T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface ListQuery {
  readonly limit?: number;
  readonly offset?: number;
  readonly keyword?: string;
}

type OrderFilterBuilder = FilterBuilder;

function page<T>(rows: T[], total: number, query: ListQuery): Page<T> {
  return {
    rows,
    total,
    limit: query.limit ?? rows.length,
    offset: query.offset ?? 0,
  };
}

export async function listServiceGroups(
  context: RequestServiceContext,
): Promise<ServiceGroupRow[]> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.ledger',
    ['view'],
  );
  const groups = scopedRepository<ServiceGroupRow>(
    context.database,
    'service_groups',
    policies,
  );
  return groups.findMany({ sort: (sort) => sort.field('code').asc() });
}

export async function listCustomers(
  context: RequestServiceContext,
  query: ListQuery,
): Promise<Page<CustomerRow>> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.ledger',
    ['view'],
  );
  const customers = scopedRepository<CustomerRow>(
    context.database,
    'customers',
    policies,
  );
  const keyword = query.keyword?.trim();
  const filter = keyword
    ? (builder: OrderFilterBuilder) =>
        builder.or([
          builder.string('name').includes(keyword, { mode: 'insensitive' }),
          builder
            .string('contactName')
            .includes(keyword, { mode: 'insensitive' }),
          builder.string('contactPhone').includes(keyword),
        ])
    : undefined;
  const rows = await customers.findMany({
    ...(filter ? { filter } : {}),
    sort: (sort) => sort.field('name').asc(),
    limit: query.limit,
    offset: query.offset,
  });
  const total = await customers.count(filter ? { filter } : {});
  return page(rows, total, query);
}

export async function createCustomer(
  context: RequestServiceContext,
  input: {
    name: string;
    contactName?: string | null;
    contactPhone?: string | null;
    address?: string | null;
    remark?: string | null;
  },
): Promise<CustomerRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.ledger',
    ['manage'],
  );
  const customers = scopedRepository<CustomerRow>(
    context.database,
    'customers',
    policies,
  );
  const now = new Date().toISOString();
  const result = await customers.createOne({
    values: {
      name: input.name,
      contactName: input.contactName ?? null,
      contactPhone: input.contactPhone ?? null,
      address: input.address ?? null,
      remark: input.remark ?? null,
      createdAt: now,
      updatedAt: now,
    },
  });
  return result.record;
}

export async function updateCustomer(
  context: RequestServiceContext,
  id: number,
  patch: Partial<CustomerRow>,
): Promise<CustomerRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.ledger',
    ['manage'],
  );
  const customers = scopedRepository<CustomerRow>(
    context.database,
    'customers',
    policies,
  );
  const allowed = [
    'name',
    'contactName',
    'contactPhone',
    'address',
    'remark',
  ] as const;
  const values: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      values[key] = patch[key];
    }
  }
  const result = await customers.updateOne({ filter: { id }, values: values });
  if (!result.record) {
    throw notFound('CUSTOMER_NOT_FOUND', `Customer ${id} was not found.`);
  }
  return result.record;
}

export async function getCustomer(
  context: RequestServiceContext,
  id: number,
): Promise<CustomerRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.ledger',
    ['view'],
  );
  const customers = scopedRepository<CustomerRow>(
    context.database,
    'customers',
    policies,
  );
  const customer = await customers.findOne({ filter: { id } });
  if (!customer) {
    throw notFound('CUSTOMER_NOT_FOUND', `Customer ${id} was not found.`);
  }
  return customer;
}

export async function listDevices(
  context: RequestServiceContext,
  query: ListQuery & { customerId?: number; engineerId?: string },
): Promise<Page<DeviceRow>> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.ledger',
    ['view'],
  );
  const devices = scopedRepository<DeviceRow>(
    context.database,
    'devices',
    policies,
  );
  const keyword = query.keyword?.trim();
  const filter = (builder: OrderFilterBuilder) =>
    builder.and([
      ...(query.customerId !== undefined
        ? [builder.number('customerId').eq(query.customerId)]
        : []),
      ...(query.engineerId
        ? [builder.string('engineerId').eq(query.engineerId)]
        : []),
      ...(keyword
        ? [
            builder.or([
              builder.string('code').includes(keyword, { mode: 'insensitive' }),
              builder.string('name').includes(keyword, { mode: 'insensitive' }),
              builder
                .string('model')
                .includes(keyword, { mode: 'insensitive' }),
            ]),
          ]
        : []),
    ]);
  const rows = await devices.findMany({
    filter,
    sort: (sort) => sort.field('code').asc(),
    limit: query.limit,
    offset: query.offset,
  });
  const total = await devices.count({ filter });
  return page(rows, total, query);
}

export async function createDevice(
  context: RequestServiceContext,
  input: {
    code: string;
    name: string;
    model?: string | null;
    customerId: number;
    engineerId?: string | null;
    groupId?: number | null;
    nextInspectionDate?: string | null;
  },
): Promise<DeviceRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.ledger',
    ['manage'],
  );
  const devices = scopedRepository<DeviceRow>(
    context.database,
    'devices',
    policies,
  );
  const duplicate = await devices.count({
    filter: (builder) => builder.string('code').eq(input.code),
  });
  if (duplicate > 0) {
    throw conflict(
      'DEVICE_CODE_TAKEN',
      `Device code ${input.code} is already in use.`,
    );
  }
  const now = new Date().toISOString();
  const result = await devices.createOne({
    values: {
      code: input.code,
      name: input.name,
      model: input.model ?? null,
      customerId: input.customerId,
      engineerId: input.engineerId ?? null,
      groupId: input.groupId ?? null,
      enabled: true,
      nextInspectionDate: input.nextInspectionDate ?? null,
      createdAt: now,
      updatedAt: now,
    },
  });
  return result.record;
}

export async function updateDevice(
  context: RequestServiceContext,
  id: number,
  patch: Partial<DeviceRow>,
): Promise<DeviceRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.ledger',
    ['manage'],
  );
  const devices = scopedRepository<DeviceRow>(
    context.database,
    'devices',
    policies,
  );
  // Renaming a device to a code another device already holds fails the unique
  // constraint; report it as a validation error instead of a 500.
  if (typeof patch.code === 'string' && patch.code !== '') {
    const duplicate = await devices.findOne({
      filter: (builder) =>
        builder.and([
          builder.string('code').eq(patch.code as string),
          builder.number('id').ne(id),
        ]),
    });
    if (duplicate) {
      throw conflict(
        'DEVICE_CODE_TAKEN',
        `Device code ${patch.code} is already in use.`,
      );
    }
  }
  const allowed = [
    'code',
    'name',
    'model',
    'customerId',
    'engineerId',
    'groupId',
    'enabled',
    'nextInspectionDate',
  ] as const;
  const values: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      values[key] = patch[key];
    }
  }
  const result = await devices.updateOne({ filter: { id }, values: values });
  if (!result.record) {
    throw notFound('DEVICE_NOT_FOUND', `Device ${id} was not found.`);
  }
  return result.record;
}

export async function getDevice(
  context: RequestServiceContext,
  id: number,
): Promise<DeviceRow> {
  const { policies } = await authorizeCompositeAction(
    context.authz,
    'service.ledger',
    ['view'],
  );
  const devices = scopedRepository<DeviceRow>(
    context.database,
    'devices',
    policies,
  );
  const device = await devices.findOne({ filter: { id } });
  if (!device) {
    throw notFound('DEVICE_NOT_FOUND', `Device ${id} was not found.`);
  }
  return device;
}

/** Resolves a device for a write path that must not create one implicitly. */
export async function requireDevice(
  database: DatabaseManager,
  id: number,
): Promise<DeviceRow> {
  const devices = database.repository<DeviceRow>('devices');
  const device = await devices.findOne({ filter: { id } });
  if (!device) {
    throw invalid('DEVICE_NOT_FOUND', `Device ${id} does not exist.`);
  }
  return device;
}

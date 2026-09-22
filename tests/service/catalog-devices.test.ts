import type { Application } from '@nocobase/app-server/application';
import type { QueryAdapter } from '@nocobase/db';
import { describe, expect, it } from 'vitest';

import { CatalogService } from '../../server/services/catalog.js';
import type { ServiceCaller } from '../../server/services/service-auth.js';

type Condition = readonly [string, string, unknown];

function matches(row: Record<string, unknown>, conditions: Condition[]) {
  return conditions.every(([field, operator, value]) => {
    if (operator === '=') return row[field] === value;
    if (operator === '!=') return row[field] !== value;
    return false;
  });
}

/** A tiny in-memory QueryAdapter covering the chains CatalogService uses. */
function createInMemoryQuery(
  tables: Record<string, Record<string, unknown>[]>,
): QueryAdapter {
  const selectChain = (table: string) => {
    const conditions: Condition[] = [];
    const chain = {
      select: () => chain,
      selectAll: () => chain,
      where: (field: string, operator: string, value: unknown) => {
        conditions.push([field, operator, value]);
        return chain;
      },
      orderBy: () => chain,
      limit: () => chain,
      execute: async () =>
        tables[table].filter((row) => matches(row, conditions)),
      executeTakeFirst: async () =>
        tables[table].find((row) => matches(row, conditions)),
    };
    return chain;
  };
  const query = {
    selectFrom: (table: string) => selectChain(table),
    insertInto: (table: string) => {
      const chain: {
        values: (data: Record<string, unknown>) => unknown;
        execute: () => Promise<void>;
      } = {
        values: (data) => {
          tables[table].push({ ...data });
          return chain;
        },
        execute: async () => undefined,
      };
      return chain;
    },
    updateTable: (table: string) => {
      const conditions: Condition[] = [];
      const chain = {
        values: undefined,
        set: (values: Record<string, unknown>) => {
          chain.values = values;
          return chain;
        },
        where: (field: string, operator: string, value: unknown) => {
          conditions.push([field, operator, value]);
          return chain;
        },
        execute: async () => {
          for (const row of tables[table])
            if (matches(row, conditions))
              Object.assign(row, chain.values ?? {});
        },
      };
      return chain;
    },
    deleteFrom: () => {
      throw new Error('deleteFrom is not implemented for this test adapter');
    },
  };
  return query as unknown as QueryAdapter;
}

function createService(tables: Record<string, Record<string, unknown>[]>) {
  const query = createInMemoryQuery(tables);
  const app = {
    container: { resolve: () => ({ query: () => query }) },
  } as unknown as Application;
  return new CatalogService(app);
}

const manager: ServiceCaller = {
  id: 'manager-1',
  name: 'Supervisor',
  region: null,
  capabilities: { 'devices.manage': true },
};

function tables(): Record<string, Record<string, unknown>[]> {
  return {
    serviceCustomers: [{ id: 1, name: 'Acme', region: 'east' }],
    serviceDevices: [
      { id: 1, code: 'CN-0001', name: 'Device one', customerId: 1 },
      { id: 2, code: 'CN-0002', name: 'Device two', customerId: 1 },
    ],
  };
}

describe('CatalogService.saveDevice duplicate codes', () => {
  it('rejects a new device whose code already exists with a 409', async () => {
    const service = createService(tables());
    await expect(
      service.saveDevice(manager, {
        code: 'CN-0001',
        name: 'Duplicate',
        customerId: 1,
        region: 'east',
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Device code already exists',
    });
  });

  it("rejects an edit that takes another device's code with a 409", async () => {
    const service = createService(tables());
    await expect(
      service.saveDevice(manager, {
        id: 2,
        code: 'CN-0001',
        name: 'Device two',
        customerId: 1,
        region: 'east',
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Device code already exists',
    });
  });

  it('lets an edit keep the device code it already owns', async () => {
    const service = createService(tables());
    await expect(
      service.saveDevice(manager, {
        id: 1,
        code: 'CN-0001',
        name: 'Device one renamed',
        customerId: 1,
        region: 'east',
      }),
    ).resolves.toMatchObject({ id: 1, code: 'CN-0001' });
  });
});

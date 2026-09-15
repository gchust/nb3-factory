import type { ServerFileRepositoryManager } from '@nocobase/app-plugin-file/server';
import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ContractsService,
  type ContractActor,
} from '../../server/providers/contracts.js';

import {
  contractMigrator,
  createTestDatabase,
  type TestDatabase,
} from './helpers.js';

const ALICE: ContractActor = { id: 'alice', name: 'Alice' };
const BOB: ContractActor = { id: 'bob', name: 'Bob' };

const open: TestDatabase[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((database) => database.close()));
});

function conditions(
  action: string,
  filter: DatabaseAuthorizationConditions['filter'],
  fields: DatabaseAuthorizationConditions['fields'] = {
    input: '*',
    output: '*',
  },
): DatabaseAuthorizationConditions {
  return {
    type: 'database',
    collection: 'main.contracts',
    action,
    filter,
    fields,
  };
}

const allRecords = conditions('read', { $and: [] });

function ownedBy(userId: string): DatabaseAuthorizationConditions {
  return conditions('read', { $and: [{ ownerId: { $eq: userId } }] });
}

async function setup(): Promise<ContractsService> {
  const test = await createTestDatabase();
  open.push(test);
  await contractMigrator(test.database).latest();
  // The service under test never touches files or the disk for these operations.
  const files = {} as unknown as ServerFileRepositoryManager;
  const drive = {} as unknown as NocoBaseDriveManager;
  const service = new ContractsService(test.database, files, drive);

  await service.create(
    {
      contractNo: 'HT-A-1',
      name: 'Alice sale',
      counterparty: 'Acme',
      type: 'sale',
      status: 'active',
      amount: 100,
      expiryDate: '2030-01-01',
    },
    ALICE,
    conditions('create', { $and: [] }),
  );
  await service.create(
    {
      contractNo: 'HT-B-1',
      name: 'Bob lease',
      counterparty: 'Beta',
      type: 'lease',
      status: 'draft',
      amount: 250,
      expiryDate: '2031-01-01',
    },
    BOB,
    conditions('create', { $and: [] }),
  );
  return service;
}

describe('ContractsService authorization conditions', () => {
  it('pushes the record filter into list, so a business owner only sees their own contracts', async () => {
    const service = await setup();

    const mine = await service.list(ownedBy('alice'), {});
    expect(mine.map((contract) => contract.contractNo)).toEqual(['HT-A-1']);

    const all = await service.list(allRecords, {});
    expect(all.map((contract) => contract.contractNo).sort()).toEqual([
      'HT-A-1',
      'HT-B-1',
    ]);
  });

  it('refuses to read a contract outside the authorized filter', async () => {
    const service = await setup();
    const all = await service.list(allRecords, {});
    const aliceContract = all.find((contract) => contract.ownerId === 'alice');
    expect(aliceContract).toBeDefined();

    await expect(
      service.findById(String(aliceContract?.id), ownedBy('bob')),
    ).resolves.toBeUndefined();
    await expect(
      service.findById(String(aliceContract?.id), ownedBy('alice')),
    ).resolves.toMatchObject({ contractNo: 'HT-A-1' });
  });

  it('cannot update a record outside the authorized filter', async () => {
    const service = await setup();
    const all = await service.list(allRecords, {});
    const aliceContract = String(
      all.find((contract) => contract.ownerId === 'alice')?.id,
    );

    const updated = await service.update(
      aliceContract,
      { status: 'terminated' },
      conditions('update', { $and: [{ ownerId: { $eq: 'bob' } }] }),
    );
    expect(updated).toBe(0);

    const stillActive = await service.findById(aliceContract, allRecords);
    expect(stillActive?.status).toBe('active');
  });

  it('rejects input fields the grant does not allow', async () => {
    const service = await setup();
    const all = await service.list(allRecords, {});
    const aliceContract = String(
      all.find((contract) => contract.ownerId === 'alice')?.id,
    );

    await expect(
      service.update(
        aliceContract,
        { status: 'expired', amount: 999 },
        conditions('update', { $and: [] }, { input: ['status'], output: '*' }),
      ),
    ).rejects.toThrow('Input fields are not authorized: amount');
  });

  it('scopes statistics by the same record filter', async () => {
    const service = await setup();

    const scoped = await service.statistics(ownedBy('alice'));
    expect(scoped.byType).toEqual([{ key: 'sale', count: 1, amount: 100 }]);

    const global = await service.statistics(allRecords);
    const totalCount = global.byType.reduce(
      (sum, bucket) => sum + bucket.count,
      0,
    );
    expect(totalCount).toBe(2);
  });

  it('filters contracts expiring inside the requested window and rejects a duplicate number', async () => {
    const service = await setup();
    const soon = new Date();
    soon.setDate(soon.getDate() + 10);
    await service.create(
      {
        contractNo: 'HT-SOON',
        name: 'Expiring soon',
        counterparty: 'Gamma',
        type: 'service',
        status: 'active',
        amount: 10,
        expiryDate: soon.toISOString().slice(0, 10),
      },
      ALICE,
      conditions('create', { $and: [] }),
    );

    const expiring = await service.list(allRecords, { expiringDays: 30 });
    expect(expiring.map((contract) => contract.contractNo)).toContain(
      'HT-SOON',
    );
    expect(expiring).toHaveLength(1);

    await expect(
      service.create(
        {
          contractNo: 'HT-SOON',
          name: 'Duplicate',
          counterparty: 'Gamma',
          type: 'service',
          status: 'active',
        },
        ALICE,
        conditions('create', { $and: [] }),
      ),
    ).rejects.toThrow();
  });
});

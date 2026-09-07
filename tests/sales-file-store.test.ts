import { describe, expect, it } from 'vitest';
import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type { Context } from 'hono';

import { createBusinessLicenseStore } from '../server/providers/sales-file-store.js';
import { DefaultSalesService } from '../server/providers/sales-service.js';
import { createTestDatabase } from './helpers/sales-test-db.js';

const ALL_RECORDS: DatabaseAuthorizationConditions = {
  type: 'database',
  collection: 'main.customers',
  action: 'read',
  filter: { $and: [] },
  fields: { input: '*', output: '*' },
};

const OWNER = 'user-owner';

function profileContext(profileId: number): Context {
  return {
    req: {
      param: (name: string) =>
        name === 'profileId' ? String(profileId) : undefined,
    },
  } as unknown as Context;
}

function fakeDrive(): { manager: NocoBaseDriveManager; deleted: string[] } {
  const deleted: string[] = [];
  const manager = {
    // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- mirrors the drive manager's `use(disk)` API
    use: () => ({
      delete: async (key: string) => {
        deleted.push(key);
      },
    }),
  } as unknown as NocoBaseDriveManager;
  return { manager, deleted };
}

function newFile(id: string, key: string) {
  return {
    id,
    disk: 'local',
    key,
    filename: 'license.png',
    mimeType: 'image/png',
    size: 1024,
    public: false,
  };
}

describe('createBusinessLicenseStore', () => {
  it('replaces the previous file for the same profile instead of failing on the unique constraint', async () => {
    const { database } = await createTestDatabase({ users: [OWNER] });
    try {
      const service = new DefaultSalesService(database);
      const { id: customerId } = await service.createCustomer(
        { name: '客户' },
        OWNER,
        ALL_RECORDS,
      );
      const customer = await service.getCustomer(customerId, ALL_RECORDS);
      const profileId = customer!.profile!.id;
      const drive = fakeDrive();
      const store = createBusinessLicenseStore(database, drive.manager);
      const context = profileContext(profileId);

      const first = await store.create(
        newFile('file-1', 'files/key-1'),
        context,
      );
      expect(first.id).toBe('file-1');
      expect(await store.list(context)).toHaveLength(1);

      // A second upload for the same profile replaces the first row instead of
      // colliding with the `customer_profile_id` UNIQUE constraint.
      const second = await store.create(
        newFile('file-2', 'files/key-2'),
        context,
      );
      expect(second.id).toBe('file-2');
      const files = await store.list(context);
      expect(files).toHaveLength(1);
      expect(files[0].id).toBe('file-2');
      // The replaced drive object was removed from storage.
      expect(drive.deleted).toContain('files/key-1');

      // find is scoped to the profile.
      expect(await store.find('file-1', context)).toBeNull();
      expect(await store.find('file-2', context)).not.toBeNull();

      // remove deletes the row and returns it.
      const removed = await store.remove('file-2', context);
      expect(removed?.id).toBe('file-2');
      expect(await store.list(context)).toHaveLength(0);
    } finally {
      await database.destroy();
    }
  });

  it('keeps files of different profiles independent', async () => {
    const { database } = await createTestDatabase({ users: [OWNER] });
    try {
      const service = new DefaultSalesService(database);
      const { id: customerA } = await service.createCustomer(
        { name: '客户A' },
        OWNER,
        ALL_RECORDS,
      );
      const { id: customerB } = await service.createCustomer(
        { name: '客户B' },
        OWNER,
        ALL_RECORDS,
      );
      const profileA = (await service.getCustomer(customerA, ALL_RECORDS))!
        .profile!.id;
      const profileB = (await service.getCustomer(customerB, ALL_RECORDS))!
        .profile!.id;
      const drive = fakeDrive();
      const store = createBusinessLicenseStore(database, drive.manager);

      await store.create(newFile('a-1', 'files/a-1'), profileContext(profileA));
      await store.create(newFile('b-1', 'files/b-1'), profileContext(profileB));

      expect(await store.list(profileContext(profileA))).toHaveLength(1);
      expect(await store.list(profileContext(profileB))).toHaveLength(1);
      expect(await store.find('a-1', profileContext(profileB))).toBeNull();
    } finally {
      await database.destroy();
    }
  });
});

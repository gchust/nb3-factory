import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

import { devicePermissionSets } from '../../seed-data/device-permission-sets.ts';

/**
 * Initial data for the device inventory: one external integration account, its
 * read-only Permission Set and assignment, and the two devices the issue asks
 * for.
 *
 * The account is granted `view` on the whole device list only. It exists so an
 * external caller can read the list with a user-bound API key issued through
 * the existing API Keys page; the set grants nothing that could write device
 * data, and nothing that opens the Database Explorer structure page.
 *
 * The seed is idempotent by logical key, so re-running it preserves an
 * administrator's later edits instead of overwriting them. It writes the
 * documented persistence rows directly — a seed's restricted connection exposes
 * no runtime authorization service — and keeps every declaration here rather
 * than importing evolving collection or model code.
 */

const INTEGRATION_USER_ID = 'device-integration';
const TEST_PASSWORD = 'device123';

const SCANNER_DEVICE_ID = 'device-scanner-a100';
const PRINTER_DEVICE_ID = 'device-printer-b200';

interface SeedQuery {
  selectFrom(table: string): {
    select(column: string): {
      where(
        column: string,
        operator: string,
        value: unknown,
      ): {
        executeTakeFirst(): Promise<unknown>;
      };
    };
  };
  insertInto(table: string): {
    values(value: Record<string, unknown>): { execute(): Promise<unknown> };
  };
}

async function idExists(
  query: SeedQuery,
  table: string,
  column: string,
  value: unknown,
): Promise<boolean> {
  const row = await query
    .selectFrom(table)
    .select('id')
    .where(column, '=', value)
    .executeTakeFirst();
  return row !== undefined;
}

const seed = defineSeed({
  name: '202609250002_device_inventory_seed',
  transaction: true,
  async run({ query: rawQuery }) {
    const query = rawQuery as unknown as SeedQuery;
    const now = new Date();

    // --- External integration account --------------------------------------
    if (!(await idExists(query, 'user', 'id', INTEGRATION_USER_ID))) {
      const passwordHash = await hashPassword(TEST_PASSWORD);
      await query
        .insertInto('user')
        .values({
          id: INTEGRATION_USER_ID,
          name: 'Device Integration',
          username: 'device.integration',
          email: 'device.integration@example.com',
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: `account-${INTEGRATION_USER_ID}`,
          accountId: INTEGRATION_USER_ID,
          providerId: 'credential',
          userId: INTEGRATION_USER_ID,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    // --- Read-only Permission Set and its assignment ------------------------
    for (const set of devicePermissionSets) {
      if (
        await idExists(query, 'authorizationPermissionSets', 'key', set.key)
      ) {
        continue;
      }
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: set.key,
          key: set.key,
          title: encodeAuthorizationTitle(set.title),
          grants: JSON.stringify(set.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: `user:${INTEGRATION_USER_ID}:${set.key}`,
          subjectType: 'user',
          subjectId: INTEGRATION_USER_ID,
          permissionSetKey: set.key,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    // --- Devices ------------------------------------------------------------
    const devices = [
      {
        id: SCANNER_DEVICE_ID,
        code: 'DEV-0001',
        name: '无线条码扫描枪',
      },
      {
        id: PRINTER_DEVICE_ID,
        code: 'DEV-0002',
        name: '热敏标签打印机',
      },
    ];
    for (const device of devices) {
      if (await idExists(query, 'devices', 'id', device.id)) {
        continue;
      }
      await query
        .insertInto('devices')
        .values({
          id: device.id,
          code: device.code,
          name: device.name,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;

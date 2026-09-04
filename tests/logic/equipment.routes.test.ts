// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ApiTestContext,
  asRecord,
  bootTestApp,
  dataOf,
  EMPLOYEE_EMAIL,
  EMPLOYEE_PASSWORD,
} from '../helpers/test-app.js';

let ctx: ApiTestContext;
let adminCookie: string;
let employeeCookie: string;
let otherEmployeeCookie: string;

let assetSeq = 0;
function nextAssetNumber(): string {
  assetSeq += 1;
  return `TEST-A-${Date.now().toString(36).toUpperCase()}-${assetSeq}`;
}

beforeAll(async () => {
  ctx = await bootTestApp();
  adminCookie = await ctx.signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  employeeCookie = await ctx.signUp(
    'Li Employee',
    EMPLOYEE_EMAIL,
    EMPLOYEE_PASSWORD,
  );
  otherEmployeeCookie = await ctx.signUp(
    'Other Employee',
    'other-employee@example.com',
    'other12345',
  );
}, 120_000);

afterAll(async () => {
  await ctx?.close();
}, 30_000);

function items(body: unknown): Array<Record<string, unknown>> {
  const record = asRecord(body);
  const value = record.data;
  if (!Array.isArray(value)) {
    throw new Error('Expected a data array.');
  }
  return value.map((item) => asRecord(item));
}

async function listEquipment(
  cookie: string,
): Promise<Array<Record<string, unknown>>> {
  const response = await ctx.api('/equipment', { cookie });
  expect(response.status).toBe(200);
  return items(response.body);
}

async function adminCreatesEquipment(
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const assetNumber = nextAssetNumber();
  const response = await ctx.api('/equipment', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      name: `Projector ${assetNumber}`,
      assetNumber,
      category: '投影设备',
      ...overrides,
    },
  });
  expect(response.status).toBe(201);
  const row = dataOf(response.body);
  expect(row.status).toBe('available');
  return row;
}

describe('authentication and authorization boundary', () => {
  it('rejects anonymous callers with 401', async () => {
    const response = await ctx.api('/equipment');
    expect(response.status).toBe(401);

    const records = await ctx.api('/equipment-borrow-records');
    expect(records.status).toBe(401);
  });

  it('lets employees read the ledger with correct per-row capabilities', async () => {
    const rows = await listEquipment(employeeCookie);
    expect(rows.length).toBeGreaterThanOrEqual(6);

    for (const row of rows) {
      expect(row.canMaintain).toBe(false);
      if (row.status === 'available') {
        expect(row.canBorrow).toBe(true);
      } else {
        expect(row.canBorrow).toBe(false);
      }
    }

    const open = rows.find((row) => row.openBorrowRecordId !== null);
    expect(open).toBeDefined();
    expect(open?.status).toBe('borrowed');
    // The seeded open borrow belongs to the administrator, so the employee
    // may not return it.
    expect(open?.canReturn).toBe(false);
  });

  it('lets the maintainer read the ledger and see maintainer capability', async () => {
    const rows = await listEquipment(adminCookie);
    expect(rows.length).toBeGreaterThanOrEqual(6);
    for (const row of rows) {
      expect(row.canMaintain).toBe(true);
    }
  });

  it('blocks employees from creating or editing equipment', async () => {
    const create = await ctx.api('/equipment', {
      method: 'POST',
      cookie: employeeCookie,
      body: {
        name: 'Sneaky projector',
        assetNumber: nextAssetNumber(),
        category: '投影设备',
      },
    });
    expect(create.status).toBe(403);

    const rows = await listEquipment(adminCookie);
    const target = rows[0];
    const patch = await ctx.api(`/equipment/${String(target.id)}`, {
      method: 'PATCH',
      cookie: employeeCookie,
      body: { name: 'Sneaky rename' },
    });
    expect(patch.status).toBe(403);
  });
});

describe('equipment CRUD (maintainer)', () => {
  it('validates the payload and rejects duplicates', async () => {
    const assetNumber = nextAssetNumber();
    const first = await adminCreatesEquipment({ assetNumber });

    const dup = await ctx.api('/equipment', {
      method: 'POST',
      cookie: adminCookie,
      body: {
        name: 'Duplicate',
        assetNumber,
        category: '打印设备',
      },
    });
    expect(dup.status).toBe(409);
    expect(asRecord(dup.body).code).toBe('DUPLICATE_ASSET_NUMBER');

    const bad = await ctx.api('/equipment', {
      method: 'POST',
      cookie: adminCookie,
      body: { name: '', assetNumber: nextAssetNumber(), category: 'x' },
    });
    expect(bad.status).toBe(400);
    expect(asRecord(bad.body).code).toBe('BAD_REQUEST');

    expect(String(first.id)).toMatch(/^\d+$/);
  });

  it('edits equipment fields', async () => {
    const row = await adminCreatesEquipment({});
    const patch = await ctx.api(`/equipment/${String(row.id)}`, {
      method: 'PATCH',
      cookie: adminCookie,
      body: { name: 'Renamed projector', category: '会议室设备' },
    });
    expect(patch.status).toBe(200);
    const updated = dataOf(patch.body);
    expect(updated.name).toBe('Renamed projector');
    expect(updated.category).toBe('会议室设备');
  });

  it('refuses status transitions that bypass the workflow', async () => {
    const row = await adminCreatesEquipment({});

    // Borrow the equipment so it is no longer available.
    const borrow = await ctx.api('/equipment-borrow-records', {
      method: 'POST',
      cookie: employeeCookie,
      body: { equipmentId: Number(row.id), note: 'borrow before transition' },
    });
    expect(borrow.status).toBe(201);

    // available/repairing are only reachable from a compatible state.
    const conflict = await ctx.api(`/equipment/${String(row.id)}`, {
      method: 'PATCH',
      cookie: adminCookie,
      body: { status: 'repairing' },
    });
    expect(conflict.status).toBe(409);
    expect(asRecord(conflict.body).code).toBe('STATUS_CONFLICT');

    // Returning releases it, then repair is allowed.
    const recordId = String(dataOf(borrow.body).id);
    const returned = await ctx.api(
      `/equipment-borrow-records/${recordId}/return`,
      { method: 'POST', cookie: employeeCookie, body: { note: 'back' } },
    );
    expect(returned.status).toBe(200);

    const repair = await ctx.api(`/equipment/${String(row.id)}`, {
      method: 'PATCH',
      cookie: adminCookie,
      body: { status: 'repairing' },
    });
    expect(repair.status).toBe(200);
    expect(dataOf(repair.body).status).toBe('repairing');

    const back = await ctx.api(`/equipment/${String(row.id)}`, {
      method: 'PATCH',
      cookie: adminCookie,
      body: { status: 'available' },
    });
    expect(back.status).toBe(200);
    expect(dataOf(back.body).status).toBe('available');
  });

  it('blocks status writes for non-maintainers', async () => {
    const row = await adminCreatesEquipment({});
    const patch = await ctx.api(`/equipment/${String(row.id)}`, {
      method: 'PATCH',
      cookie: employeeCookie,
      body: { status: 'repairing' },
    });
    expect(patch.status).toBe(403);
  });

  it('deletes equipment without borrow records but protects the ledger', async () => {
    const row = await adminCreatesEquipment({});

    const borrow = await ctx.api('/equipment-borrow-records', {
      method: 'POST',
      cookie: employeeCookie,
      body: { equipmentId: Number(row.id) },
    });
    expect(borrow.status).toBe(201);
    const borrowId = String(dataOf(borrow.body).id);

    const blocked = await ctx.api(`/equipment/${String(row.id)}`, {
      method: 'DELETE',
      cookie: adminCookie,
    });
    expect(blocked.status).toBe(409);
    expect(asRecord(blocked.body).code).toBe('HAS_BORROW_RECORDS');

    // Return it and the delete stays blocked: history must survive.
    await ctx.api(`/equipment-borrow-records/${borrowId}/return`, {
      method: 'POST',
      cookie: employeeCookie,
    });
    const blockedAgain = await ctx.api(`/equipment/${String(row.id)}`, {
      method: 'DELETE',
      cookie: adminCookie,
    });
    expect(blockedAgain.status).toBe(409);

    const fresh = await adminCreatesEquipment({});
    const deleted = await ctx.api(`/equipment/${String(fresh.id)}`, {
      method: 'DELETE',
      cookie: adminCookie,
    });
    expect(deleted.status).toBe(200);
    expect(asRecord(deleted.body).data).toEqual({ deleted: true });
  });
});

describe('borrow and return workflow', () => {
  it('borrows available equipment and marks it borrowed', async () => {
    const row = await adminCreatesEquipment({});

    const borrow = await ctx.api('/equipment-borrow-records', {
      method: 'POST',
      cookie: employeeCookie,
      body: { equipmentId: Number(row.id), note: 'needed for the meeting' },
    });
    expect(borrow.status).toBe(201);
    const record = dataOf(borrow.body);
    expect(record.equipmentId).toBe(Number(row.id));
    expect(record.returnedAt).toBeNull();

    const rows = await listEquipment(employeeCookie);
    const updated = rows.find((item) => Number(item.id) === Number(row.id));
    expect(updated?.status).toBe('borrowed');
    expect(updated?.canBorrow).toBe(false);
    expect(updated?.openBorrowRecordId).toBe(Number(record.id));
    expect(updated?.canReturn).toBe(true);
  });

  it('rejects a second borrow of the same equipment', async () => {
    const row = await adminCreatesEquipment({});
    const first = await ctx.api('/equipment-borrow-records', {
      method: 'POST',
      cookie: employeeCookie,
      body: { equipmentId: Number(row.id) },
    });
    expect(first.status).toBe(201);

    const second = await ctx.api('/equipment-borrow-records', {
      method: 'POST',
      cookie: otherEmployeeCookie,
      body: { equipmentId: Number(row.id) },
    });
    expect(second.status).toBe(409);
    expect(asRecord(second.body).code).toBe('EQUIPMENT_UNAVAILABLE');
  });

  it('returns equipment via the owning record and restores availability', async () => {
    const row = await adminCreatesEquipment({});
    const borrow = await ctx.api('/equipment-borrow-records', {
      method: 'POST',
      cookie: employeeCookie,
      body: { equipmentId: Number(row.id) },
    });
    expect(borrow.status).toBe(201);
    const recordId = String(dataOf(borrow.body).id);

    const returned = await ctx.api(
      `/equipment-borrow-records/${recordId}/return`,
      { method: 'POST', cookie: employeeCookie, body: { note: 'returned ok' } },
    );
    expect(returned.status).toBe(200);
    const returnedRecord = dataOf(returned.body);
    expect(returnedRecord.returnedAt).not.toBeNull();
    expect(returnedRecord.note).toBe('returned ok');

    const again = await ctx.api(
      `/equipment-borrow-records/${recordId}/return`,
      { method: 'POST', cookie: employeeCookie },
    );
    expect(again.status).toBe(409);
    expect(asRecord(again.body).code).toBe('ALREADY_RETURNED');

    const rows = await listEquipment(employeeCookie);
    const updated = rows.find((item) => Number(item.id) === Number(row.id));
    expect(updated?.status).toBe('available');
    expect(updated?.openBorrowRecordId).toBeNull();
  });

  it('confines returns to the borrowing employee (row-level access)', async () => {
    const row = await adminCreatesEquipment({});
    const borrow = await ctx.api('/equipment-borrow-records', {
      method: 'POST',
      cookie: employeeCookie,
      body: { equipmentId: Number(row.id) },
    });
    expect(borrow.status).toBe(201);
    const recordId = String(dataOf(borrow.body).id);

    const other = await ctx.api(
      `/equipment-borrow-records/${recordId}/return`,
      { method: 'POST', cookie: otherEmployeeCookie },
    );
    // The other employee may not return a record they do not own.
    expect(other.status).toBe(404);

    const records = await ctx.api('/equipment-borrow-records', {
      cookie: otherEmployeeCookie,
    });
    expect(records.status).toBe(200);
    const rows = items(records.body);
    const theirs = rows.find((item) => String(item.id) === recordId);
    expect(theirs?.canReturn).toBe(false);

    // The maintainer can return any record.
    const adminReturn = await ctx.api(
      `/equipment-borrow-records/${recordId}/return`,
      { method: 'POST', cookie: adminCookie },
    );
    expect(adminReturn.status).toBe(200);
  });

  it('rejects borrowing unknown equipment', async () => {
    const borrow = await ctx.api('/equipment-borrow-records', {
      method: 'POST',
      cookie: employeeCookie,
      body: { equipmentId: 999_999_999 },
    });
    expect(borrow.status).toBe(404);
    expect(asRecord(borrow.body).code).toBe('EQUIPMENT_NOT_FOUND');
  });

  it('exposes borrow history with joined equipment details', async () => {
    const row = await adminCreatesEquipment({});
    const borrow = await ctx.api('/equipment-borrow-records', {
      method: 'POST',
      cookie: employeeCookie,
      body: { equipmentId: Number(row.id) },
    });
    expect(borrow.status).toBe(201);
    const recordId = String(dataOf(borrow.body).id);

    const records = await ctx.api('/equipment-borrow-records', {
      cookie: employeeCookie,
    });
    expect(records.status).toBe(200);
    const rows = items(records.body);
    const own = rows.find((item) => String(item.id) === recordId);
    expect(own?.equipmentName).toBe(String(row.name));
    expect(own?.assetNumber).toBe(String(row.assetNumber));
    expect(own?.borrowerName).toBe('Li Employee');
    expect(own?.canReturn).toBe(true);

    // The history includes the seeded examples (an open and a returned one).
    expect(rows.some((item) => item.returnedAt === null)).toBe(true);
    expect(rows.some((item) => item.returnedAt !== null)).toBe(true);
  });
});

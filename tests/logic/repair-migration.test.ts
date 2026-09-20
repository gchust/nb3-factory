// @vitest-environment node
import { expect, it } from 'vitest';

import { createRepairTestDatabase } from '../helpers/repair-db.js';

// Physical (snake_case) table names the migration derives from its logical Collection names.
const TABLES = [
  'buildings',
  'rooms',
  'equipment',
  'materials',
  'repair_tickets',
  'repair_ticket_events',
  'repair_ticket_materials',
  'repair_material_transactions',
  'repair_files',
  'repair_ticket_files',
  'repair_settlements',
  'repair_members',
];

it('creates every repair table with usable columns', async () => {
  const database = await createRepairTestDatabase();
  try {
    const query = database.manager.query();
    const tables = (await query
      .selectFrom('sqlite_master')
      .select(['name'])
      .where('type', '=', 'table')
      .execute()) as { name: string }[];
    const names = new Set(tables.map((row) => row.name));
    for (const table of TABLES) {
      expect(names.has(table), `missing table ${table}`).toBe(true);
    }

    // A full round trip proves the column set and the storage format the adapter accepts.
    const now = new Date();
    const building = await query
      .insertInto('buildings')
      .values({
        code: 'T',
        name: 'Probe building',
        address: null,
        floors: 1,
        manager: null,
        remark: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const buildingId = Number(building.insertId);
    await query
      .insertInto('repairTickets')
      .values({
        ticketNo: 'TEST-0001',
        title: 'Schema probe',
        buildingId,
        roomId: null,
        equipmentId: null,
        location: 'A 1F',
        faultType: 'plumbing',
        priority: 'normal',
        description: 'probe',
        contactName: 'tester',
        contactPhone: '1',
        status: 'pending_dispatch',
        reporterId: 'user-1',
        reporterName: 'Tester',
        assigneeId: null,
        assigneeName: null,
        assignedAt: null,
        dueAt: null,
        startedAt: null,
        finishedAt: null,
        faultCause: null,
        repairProcess: null,
        laborCost: 12.5,
        reworkCount: 0,
        cancelReason: null,
        acceptanceResult: null,
        acceptanceRemark: null,
        acceptedAt: null,
        completedAt: null,
        settledAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const stored = (await query
      .selectFrom('repairTickets')
      .selectAll()
      .where('ticketNo', '=', 'TEST-0001')
      .executeTakeFirst()) as Record<string, unknown>;
    expect(stored.title).toBe('Schema probe');
    expect(Number(stored.laborCost)).toBe(12.5);
    expect(stored.reporterId).toBe('user-1');

    const file = await query
      .insertInto('repairFiles')
      .values({
        id: '11111111-2222-4333-8444-555555555555',
        disk: 'local',
        key: 'probe/key.txt',
        filename: 'probe.txt',
        ext: 'txt',
        mimeType: 'text/plain',
        size: 3,
        uploadedById: null,
        uploadedByName: null,
        note: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    expect(Number(file.insertId)).toBeGreaterThanOrEqual(0);
  } finally {
    await database.cleanup();
  }
});

it('enforces one settlement per ticket and reverses on rollback', async () => {
  const database = await createRepairTestDatabase();
  try {
    const query = database.manager.query();
    const now = new Date();
    await query
      .insertInto('buildings')
      .values({
        code: 'Z',
        name: 'Probe building',
        address: null,
        floors: 1,
        manager: null,
        remark: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await query
      .insertInto('repairTickets')
      .values({
        ticketNo: 'TEST-0002',
        title: 'Settlement probe',
        buildingId: 1,
        roomId: null,
        equipmentId: null,
        location: 'Z 1F',
        faultType: 'other',
        priority: 'low',
        description: 'probe',
        contactName: 'tester',
        contactPhone: '1',
        status: 'completed',
        reporterId: 'user-1',
        reporterName: 'Tester',
        assigneeId: null,
        assigneeName: null,
        assignedAt: null,
        dueAt: null,
        startedAt: null,
        finishedAt: null,
        faultCause: null,
        repairProcess: null,
        laborCost: 0,
        reworkCount: 0,
        cancelReason: null,
        acceptanceResult: null,
        acceptanceRemark: null,
        acceptedAt: null,
        completedAt: null,
        settledAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const settlement = {
      settlementNo: 'ST-TEST-0002',
      ticketId: 1,
      materialCost: 0,
      laborCost: 10,
      totalAmount: 10,
      status: 'settled',
      settledById: 'user-2',
      settledByName: 'Finance',
      remark: null,
      settledAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await query.insertInto('repairSettlements').values(settlement).execute();
    await expect(
      query
        .insertInto('repairSettlements')
        .values({ ...settlement, settlementNo: 'ST-TEST-0002-B' })
        .execute(),
    ).rejects.toThrow();

    // `down` is the explicit reverse: every repair table disappears.
    await database.migrator.rollback();
    await expect(
      database.manager
        .query()
        .selectFrom('repairTickets')
        .selectAll()
        .execute(),
    ).rejects.toThrow();
    await expect(
      database.manager
        .query()
        .selectFrom('repairSettlements')
        .selectAll()
        .execute(),
    ).rejects.toThrow();
  } finally {
    await database.cleanup();
  }
});

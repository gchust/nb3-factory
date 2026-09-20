// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { DatabaseManager } from '@nocobase/db';

import { createRepairTestDatabase } from '../helpers/repair-db.js';
import {
  RepairError,
  RepairService,
  type RepairPrincipal,
} from '../../server/providers/repair-service.js';

let database: Awaited<ReturnType<typeof createRepairTestDatabase>>;
let manager: DatabaseManager;
let service: RepairService;

const REPORTER: RepairPrincipal = {
  userId: 'user-reporter',
  name: 'Reporter',
  role: 'reporter',
};
const OTHER_REPORTER: RepairPrincipal = {
  userId: 'user-other',
  name: 'Other reporter',
  role: 'reporter',
};
const TECHNICIAN: RepairPrincipal = {
  userId: 'user-tech',
  name: 'Technician',
  role: 'technician',
};
const OTHER_TECHNICIAN: RepairPrincipal = {
  userId: 'user-tech-2',
  name: 'Other technician',
  role: 'technician',
};
const DISPATCHER: RepairPrincipal = {
  userId: 'user-dispatcher',
  name: 'Dispatcher',
  role: 'dispatcher',
};
const SUPERVISOR: RepairPrincipal = {
  userId: 'user-supervisor',
  name: 'Supervisor',
  role: 'supervisor',
};
const FINANCE: RepairPrincipal = {
  userId: 'user-finance',
  name: 'Finance',
  role: 'finance',
};

async function seedFixture(): Promise<void> {
  const query = manager.query();
  const now = new Date();
  await query
    .insertInto('buildings')
    .values({
      code: 'A',
      name: 'Building A',
      address: null,
      floors: 3,
      manager: null,
      remark: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  for (const member of [
    {
      userId: TECHNICIAN.userId,
      role: 'technician',
      displayName: 'Technician',
    },
    {
      userId: OTHER_TECHNICIAN.userId,
      role: 'technician',
      displayName: 'Other technician',
    },
    {
      userId: DISPATCHER.userId,
      role: 'dispatcher',
      displayName: 'Dispatcher',
    },
    {
      userId: SUPERVISOR.userId,
      role: 'supervisor',
      displayName: 'Supervisor',
    },
    { userId: FINANCE.userId, role: 'finance', displayName: 'Finance' },
    { userId: REPORTER.userId, role: 'reporter', displayName: 'Reporter' },
  ]) {
    await query
      .insertInto('repairMembers')
      .values({ ...member, createdAt: now, updatedAt: now })
      .execute();
  }
  await query
    .insertInto('materials')
    .values({
      code: 'M-001',
      name: 'Pipe',
      category: 'plumbing',
      unit: 'pc',
      unitPrice: 10,
      stock: 5,
      safetyStock: 1,
      remark: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function createTicket(
  principal: RepairPrincipal,
  overrides: Record<string, unknown> = {},
): Promise<number> {
  const id = await service.createTicket(principal, {
    title: 'Leaking pipe',
    buildingId: 1,
    location: 'A 101',
    faultType: 'plumbing',
    priority: 'normal',
    description: 'Water under the sink',
    contactName: 'Reporter',
    contactPhone: '13800000000',
    ...overrides,
  });
  return id;
}

async function addEvidence(
  ticketId: number,
  category: 'fault' | 'before' | 'after' | 'report' | 'receipt',
): Promise<string> {
  const query = manager.query();
  const now = new Date();
  const fileId = crypto.randomUUID();
  await query
    .insertInto('repairFiles')
    .values({
      id: fileId,
      disk: 'local',
      key: `test/${fileId}`,
      filename: `${category}.png`,
      ext: 'png',
      mimeType: 'image/png',
      size: 10,
      uploadedById: TECHNICIAN.userId,
      uploadedByName: TECHNICIAN.name,
      note: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await service.linkFiles(TECHNICIAN, ticketId, [fileId], category, null);
  return fileId;
}

async function driveToPendingAcceptance(): Promise<number> {
  const ticketId = await createTicket(REPORTER);
  await service.dispatchTicket(DISPATCHER, ticketId, {
    assigneeId: TECHNICIAN.userId,
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  await service.startTicket(TECHNICIAN, ticketId);
  await addEvidence(ticketId, 'after');
  await addEvidence(ticketId, 'report');
  await service.finishTicket(TECHNICIAN, ticketId, {
    faultCause: 'Worn seal',
    repairProcess: 'Replaced the seal',
    laborCost: 40,
  });
  return ticketId;
}

beforeEach(async () => {
  database = await createRepairTestDatabase();
  manager = database.manager;
  service = new RepairService(manager);
  await seedFixture();
});

afterEach(async () => {
  await database.cleanup();
});

it('resolves an application role and defaults unknown users to reporter', async () => {
  expect(
    await service.resolvePrincipal({ id: TECHNICIAN.userId }),
  ).toMatchObject({ role: 'technician' });
  expect(await service.resolvePrincipal({ id: 'stranger' })).toMatchObject({
    role: 'reporter',
  });
  expect(service.capabilities(SUPERVISOR).accept).toBe(true);
  expect(service.capabilities(SUPERVISOR).settle).toBe(false);
  expect(service.capabilities(TECHNICIAN).viewAll).toBe(false);
});

it('scopes ticket lists to each role', async () => {
  const mine = await createTicket(REPORTER);
  const other = await createTicket(OTHER_REPORTER);
  await service.dispatchTicket(DISPATCHER, other, {
    assigneeId: OTHER_TECHNICIAN.userId,
    dueAt: new Date(Date.now() + 3_600_000).toISOString(),
  });

  const reporterList = await service.listTickets(REPORTER, {});
  expect(reporterList.rows.map((row) => row.id)).toEqual([mine]);

  const technicianList = await service.listTickets(TECHNICIAN, {});
  expect(technicianList.rows).toHaveLength(0);
  expect(await service.listTickets(OTHER_TECHNICIAN, {})).toMatchObject({
    total: 1,
  });

  const supervisorList = await service.listTickets(SUPERVISOR, {});
  expect(supervisorList.total).toBe(2);

  await expect(service.getTicket(REPORTER, other)).rejects.toThrow(RepairError);
  await expect(service.getTicket(REPORTER, other)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
});

it('refuses to dispatch without the capability and to start for the wrong technician', async () => {
  const ticketId = await createTicket(REPORTER);
  await expect(
    service.dispatchTicket(TECHNICIAN, ticketId, {
      assigneeId: TECHNICIAN.userId,
      dueAt: new Date(Date.now() + 3_600_000).toISOString(),
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });

  await service.dispatchTicket(DISPATCHER, ticketId, {
    assigneeId: TECHNICIAN.userId,
    dueAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  await expect(
    service.startTicket(OTHER_TECHNICIAN, ticketId),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

it('requires process notes and after/report evidence before acceptance', async () => {
  const ticketId = await createTicket(REPORTER);
  await service.dispatchTicket(DISPATCHER, ticketId, {
    assigneeId: TECHNICIAN.userId,
    dueAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  await service.startTicket(TECHNICIAN, ticketId);

  await expect(
    service.finishTicket(TECHNICIAN, ticketId, {
      faultCause: '',
      repairProcess: '',
    }),
  ).rejects.toMatchObject({ code: 'VALIDATION' });

  await addEvidence(ticketId, 'after');
  await expect(
    service.finishTicket(TECHNICIAN, ticketId, {
      faultCause: 'Worn seal',
      repairProcess: 'Replaced the seal',
    }),
  ).rejects.toMatchObject({ code: 'MISSING_EVIDENCE' });

  await addEvidence(ticketId, 'report');
  const finished = await service.finishTicket(TECHNICIAN, ticketId, {
    faultCause: 'Worn seal',
    repairProcess: 'Replaced the seal',
    laborCost: 40,
  });
  expect(finished.status).toBe('pending_acceptance');
});

it('keeps rework history and only settles an accepted ticket once', async () => {
  const ticketId = await driveToPendingAcceptance();

  await service.rejectTicket(REPORTER, ticketId, {
    remark: 'Still leaking, please recheck',
  });
  const rejected = await service.getTicket(SUPERVISOR, ticketId);
  expect(rejected.status).toBe('rework');
  expect(rejected.reworkCount).toBe(1);
  expect(rejected.acceptanceRemark).toBe('Still leaking, please recheck');
  expect(rejected.events.map((event) => event.type)).toEqual([
    'created',
    'dispatched',
    'started',
    'submitted',
    'rejected',
  ]);

  await expect(
    service.settleTicket(FINANCE, ticketId, {}),
  ).rejects.toMatchObject({ code: 'NOT_SETTLEABLE' });

  await service.startTicket(TECHNICIAN, ticketId);
  await service.finishTicket(TECHNICIAN, ticketId, {
    faultCause: 'Worn seal',
    repairProcess: 'Replaced the seal and tested',
    laborCost: 55,
  });
  await service.acceptTicket(REPORTER, ticketId, { remark: 'Verified' });

  const accepted = await service.getTicket(SUPERVISOR, ticketId);
  expect(accepted.status).toBe('completed');
  expect(accepted.events.map((event) => event.type)).toEqual([
    'created',
    'dispatched',
    'started',
    'submitted',
    'rejected',
    'started',
    'submitted',
    'accepted',
  ]);

  const settlement = await service.settleTicket(FINANCE, ticketId, {
    remark: 'First bill',
  });
  expect(settlement.totalAmount).toBe(55);
  expect(settlement.settlementNo).toBe(`ST-${accepted.ticketNo}`);

  await expect(
    service.settleTicket(FINANCE, ticketId, {}),
  ).rejects.toMatchObject({ code: 'SETTLEMENT_EXISTS' });

  const settlements = await service.listSettlements(FINANCE, {});
  expect(settlements.total).toBe(1);
});

it('never lets material consumption go negative and makes a return idempotent', async () => {
  const ticketId = await createTicket(REPORTER);
  await service.dispatchTicket(DISPATCHER, ticketId, {
    assigneeId: TECHNICIAN.userId,
    dueAt: new Date(Date.now() + 3_600_000).toISOString(),
  });

  await expect(
    service.consumeMaterial(TECHNICIAN, ticketId, {
      materialId: 1,
      quantity: 6,
    }),
  ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

  await service.consumeMaterial(TECHNICIAN, ticketId, {
    materialId: 1,
    quantity: 4,
  });
  expect((await service.listMaterials())[0]?.stock).toBe(1);

  const usages = await service.listTicketMaterials(SUPERVISOR, ticketId);
  expect(usages).toHaveLength(1);
  expect(usages[0]?.cost).toBe(40);

  const first = await service.returnMaterial(TECHNICIAN, usages[0]!.id, {});
  expect(first).toMatchObject({ alreadyReturned: false, stock: 5 });

  const second = await service.returnMaterial(TECHNICIAN, usages[0]!.id, {});
  expect(second).toMatchObject({ alreadyReturned: true, stock: 5 });
  expect((await service.listMaterials())[0]?.stock).toBe(5);
});

it('decides file access from current ticket access', async () => {
  const ticketId = await createTicket(REPORTER);
  const fileId = await addEvidence(ticketId, 'fault');

  expect(await service.canAccessFile(REPORTER, fileId)).toBe('ok');
  expect(await service.canAccessFile(OTHER_REPORTER, fileId)).toBe('denied');
  expect(await service.canAccessFile(SUPERVISOR, fileId)).toBe('ok');
  expect(await service.canAccessFile(REPORTER, crypto.randomUUID())).toBe(
    'missing',
  );

  // Reassignment revokes the previous technician's access without touching the file.
  await service.dispatchTicket(DISPATCHER, ticketId, {
    assigneeId: TECHNICIAN.userId,
    dueAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  expect(await service.canAccessFile(TECHNICIAN, fileId)).toBe('ok');
  expect(await service.canAccessFile(OTHER_TECHNICIAN, fileId)).toBe('denied');
});

it('reports dashboard metrics for the caller scope', async () => {
  await driveToPendingAcceptance();
  await createTicket(REPORTER, { title: 'Second' });
  await createTicket(OTHER_REPORTER, { title: 'Someone else' });

  const reporterDashboard = await service.dashboard(REPORTER);
  expect(reporterDashboard.pendingDispatch).toBe(1);
  expect(reporterDashboard.pendingAcceptance).toBe(1);

  const supervisorDashboard = await service.dashboard(SUPERVISOR);
  expect(supervisorDashboard.pendingDispatch).toBe(2);
  expect(supervisorDashboard.createdThisMonth).toBe(3);
  expect(supervisorDashboard.statusBreakdown).toHaveLength(7);
});

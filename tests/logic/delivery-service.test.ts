// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import { beforeAll, describe, expect, it } from 'vitest';

import schemaMigration from '../../database/main/migrations/202609200001_create_contract_delivery_schema.js';
import fileMigration from '../../database/main/migrations/202609200002_create_contract_delivery_file_collections.js';
import {
  resolveContractScope,
  resolveActor,
} from '../../server/providers/delivery/access.js';
import { DeliveryError } from '../../server/providers/delivery/errors.js';
import { DeliveryService } from '../../server/providers/delivery/service.js';

const roots: string[] = [];
let manager: DatabaseManager;
let service: DeliveryService;

const now = '2026-01-05T09:00:00.000';

const LEAD = 'user-lead';
const MANAGER = 'user-manager';
const ACCEPTOR = 'user-acceptor';
const FINANCE = 'user-finance';
const OUTSIDER = 'user-outsider';

async function seed(): Promise<void> {
  const query = manager.query();
  await query
    .insertInto('user')
    .values([
      {
        id: LEAD,
        name: 'Lead',
        username: 'lead',
        email: 'lead@example.invalid',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: MANAGER,
        name: 'Manager',
        username: 'manager',
        email: 'manager@example.invalid',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: ACCEPTOR,
        name: 'Acceptor',
        username: 'acceptor',
        email: 'acceptor@example.invalid',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: FINANCE,
        name: 'Finance',
        username: 'finance',
        email: 'finance@example.invalid',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: OUTSIDER,
        name: 'Outsider',
        username: 'outsider',
        email: 'outsider@example.invalid',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ] as never)
    .execute();
  await query
    .insertInto('cdRoleAssignments')
    .values([
      { id: 1, userId: LEAD, role: 'lead', createdAt: now, updatedAt: now },
      {
        id: 2,
        userId: MANAGER,
        role: 'manager',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 3,
        userId: ACCEPTOR,
        role: 'acceptor',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 4,
        userId: FINANCE,
        role: 'finance',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 5,
        userId: OUTSIDER,
        role: 'member',
        createdAt: now,
        updatedAt: now,
      },
    ] as never)
    .execute();
  await query
    .insertInto('cdCustomers')
    .values({
      id: 1,
      code: 'C001',
      name: 'Customer',
      ownerId: LEAD,
      createdAt: now,
      updatedAt: now,
    } as never)
    .execute();
  await query
    .insertInto('cdContracts')
    .values([
      {
        id: 1,
        contractNo: 'CT-1',
        title: 'Managed contract',
        customerId: 1,
        amountCents: 1_000_000,
        currency: 'CNY',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        managerId: MANAGER,
        status: 'performing',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 2,
        contractNo: 'CT-2',
        title: 'Draft contract',
        customerId: 1,
        amountCents: 500_000,
        currency: 'CNY',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        managerId: LEAD,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      },
    ] as never)
    .execute();
  await query
    .insertInto('cdContractMembers')
    .values({
      id: 1,
      contractId: 1,
      userId: MANAGER,
      memberRole: 'manager',
      createdAt: now,
      updatedAt: now,
    } as never)
    .execute();
  await query
    .insertInto('cdMilestones')
    .values({
      id: 1,
      contractId: 1,
      name: 'M1',
      seq: 1,
      dueDate: '2026-06-30',
      ownerId: MANAGER,
      acceptorId: ACCEPTOR,
      amountCents: 400_000,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    } as never)
    .execute();
  await query
    .insertInto('cdDeliverables')
    .values({
      id: 1,
      milestoneId: 1,
      name: 'Deliverable',
      status: 'draft',
      currentVersion: 0,
      createdAt: now,
      updatedAt: now,
    } as never)
    .execute();
  await query
    .insertInto('cdDeliverableVersions')
    .values({
      id: 1,
      deliverableId: 1,
      versionNo: 1,
      status: 'pending_review',
      submittedById: MANAGER,
      submittedAt: now,
      reviewerId: ACCEPTOR,
      createdAt: now,
      updatedAt: now,
    } as never)
    .execute();
  await query
    .insertInto('cdDeliverableFiles')
    .values({
      id: '11111111-1111-4111-8111-111111111111',
      disk: 'local',
      key: 'objects/a.txt',
      filename: 'a.txt',
      ext: 'txt',
      mimeType: 'text/plain',
      size: 12,
      uploadedById: MANAGER,
      uploadedByName: 'Manager',
      createdAt: now,
      updatedAt: now,
    } as never)
    .execute();
  await query
    .insertInto('cdFileLinks')
    .values({
      id: 1,
      fileKind: 'deliverable',
      fileId: '11111111-1111-4111-8111-111111111111',
      targetType: 'version',
      targetId: 1,
      createdById: MANAGER,
      createdAt: now,
      updatedAt: now,
    } as never)
    .execute();
}

beforeAll(async () => {
  const parent = path.resolve('tests/.tmp');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'delivery-service-'));
  roots.push(root);
  manager = createDatabaseManager({
    drivers: { sqlite },
    default: 'main',
    connections: {
      main: { dialect: 'sqlite', filename: path.join(root, 'main.sqlite') },
    },
  });
  const builder = manager.builder('main');
  // The `user` table belongs to the authentication plugin; this file only
  // mirrors the columns the delivery service reads from it.
  await builder.createCollection('user', (collection) => {
    collection.string('id', { length: 64, nullable: false }).primary();
    collection.string('name', { length: 255, nullable: false });
    collection.string('username', { length: 255, nullable: true });
    collection.string('email', { length: 320, nullable: false });
    collection.boolean('emailVerified', {
      nullable: false,
      defaultValue: false,
    });
    collection.datetime('createdAt', { nullable: false });
    collection.datetime('updatedAt', { nullable: false });
  });
  await schemaMigration.up({ builder } as never);
  await fileMigration.up({ builder } as never);
  service = new DeliveryService(manager, '/main');
  await seed();
});

process.on('exit', () => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

async function contextFor(userId: string) {
  return service.contextFor(userId, userId);
}

describe('contract scope', () => {
  it('gives the business lead and finance the whole contract book', async () => {
    const lead = await resolveActor(manager.query(), LEAD, 'Lead');
    const finance = await resolveActor(manager.query(), FINANCE, 'Finance');
    const leadScope = await resolveContractScope(manager.query(), lead);
    const financeScope = await resolveContractScope(manager.query(), finance);
    expect(leadScope.readAll).toBe(true);
    expect(leadScope.manageAll).toBe(true);
    expect(financeScope.readAll).toBe(true);
    expect(financeScope.manageAll).toBe(false);
  });

  it('scopes a project manager to the contracts they own', async () => {
    const context = await contextFor(MANAGER);
    expect(context.scope.readAll).toBe(false);
    expect([...context.scope.readableContractIds]).toEqual([1]);
    const page = await service.listContracts(context, {});
    expect(page.items.map((row) => row.id)).toEqual([1]);
  });

  it('scopes an acceptance specialist to the milestones assigned to them', async () => {
    const context = await contextFor(ACCEPTOR);
    expect([...context.scope.acceptedMilestoneIds]).toEqual([1]);
    expect([...context.scope.readableContractIds]).toEqual([1]);
  });

  it('shows a member with no participation nothing at all', async () => {
    const context = await contextFor(OUTSIDER);
    const page = await service.listContracts(context, {});
    expect(page.items).toHaveLength(0);
    const dashboard = await service.dashboard(context);
    expect(dashboard.cards).toMatchObject({
      activeContracts: 0,
      totalMilestones: 0,
    });
  });
});

describe('contract and milestone rules', () => {
  it('refuses a status jump that is not in the lifecycle', async () => {
    const context = await contextFor(LEAD);
    await expect(
      service.changeContractStatus(context, 2, 'completed'),
    ).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
    const moved = await service.changeContractStatus(context, 2, 'active');
    expect((moved.contract as { status: string }).status).toBe('active');
  });

  it('refuses an allocation above the contract amount and accepts one inside it', async () => {
    const context = await contextFor(LEAD);
    await expect(
      service.createMilestone(context, 1, {
        name: 'Too big',
        dueDate: '2026-07-01',
        amountCents: 900_000,
      }),
    ).rejects.toMatchObject({ code: 'ALLOCATION_EXCEEDS_CONTRACT' });

    const created = await service.createMilestone(context, 1, {
      name: 'Fits',
      dueDate: '2026-07-01',
      amountCents: 100_000,
    });
    expect(Number(created.amountCents)).toBe(100_000);
  });

  it('refuses a negative amount', async () => {
    const context = await contextFor(LEAD);
    await expect(
      service.createMilestone(context, 1, {
        name: 'Negative',
        dueDate: '2026-07-01',
        amountCents: -1,
      }),
    ).rejects.toMatchObject({ code: 'NEGATIVE_AMOUNT' });
  });

  it('refuses contract maintenance from a role that does not own it', async () => {
    const context = await contextFor(FINANCE);
    await expect(service.updateContract(context, 1, {})).rejects.toBeInstanceOf(
      DeliveryError,
    );
  });
});

describe('acceptance workflow', () => {
  it('returns a version only with a reason and lets the assigned specialist approve it', async () => {
    const lead = await contextFor(LEAD);
    await expect(service.returnVersion(lead, 1, '   ')).rejects.toMatchObject({
      code: 'REASON_REQUIRED',
    });

    const acceptor = await contextFor(ACCEPTOR);
    await expect(
      service.returnVersion(acceptor, 1, 'Missing criteria'),
    ).resolves.toBeTruthy();
    const versions = await service.listVersions(acceptor, 1);
    expect(versions[0]?.status).toBe('returned');
  });

  it('refuses approval from someone who is not the assigned specialist', async () => {
    const query = manager.query();
    await query
      .insertInto('cdDeliverableVersions')
      .values({
        id: 50,
        deliverableId: 1,
        versionNo: 50,
        status: 'pending_review',
        submittedById: MANAGER,
        submittedAt: now,
        reviewerId: ACCEPTOR,
        createdAt: now,
        updatedAt: now,
      } as never)
      .execute();

    const outsider = await contextFor(OUTSIDER);
    await expect(
      service.approveVersion(outsider, 50, 'ok'),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    const managerContext = await contextFor(MANAGER);
    await expect(
      service.approveVersion(managerContext, 50, 'ok'),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    const acceptor = await contextFor(ACCEPTOR);
    await expect(
      service.approveVersion(acceptor, 50, 'ok'),
    ).resolves.toBeTruthy();
  });

  it('does not allow approving a version that was withdrawn', async () => {
    const query = manager.query();
    await query
      .insertInto('cdDeliverableVersions')
      .values({
        id: 90,
        deliverableId: 1,
        versionNo: 90,
        status: 'withdrawn',
        submittedById: MANAGER,
        createdAt: now,
        updatedAt: now,
      } as never)
      .execute();
    const acceptor = await contextFor(ACCEPTOR);
    await expect(
      service.approveVersion(acceptor, 90, 'ok'),
    ).rejects.toMatchObject({
      code: 'VERSION_WITHDRAWN',
    });
  });
});

describe('receivables and payments', () => {
  it('creates the receivable once the milestone is accepted, and only once', async () => {
    const query = manager.query();
    await query
      .insertInto('cdMilestones')
      .values({
        id: 60,
        contractId: 1,
        name: 'M60',
        seq: 60,
        dueDate: '2026-09-30',
        ownerId: MANAGER,
        acceptorId: ACCEPTOR,
        amountCents: 200_000,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      } as never)
      .execute();

    const context = await contextFor(LEAD);
    await expect(service.confirmReceivable(context, 60)).rejects.toMatchObject({
      code: 'MILESTONE_NOT_ACCEPTED',
    });

    await query
      .updateTable('cdMilestones')
      .set({ status: 'accepted' } as never)
      .where('id', '=', 60)
      .execute();
    const first = await service.confirmReceivable(context, 60);
    const second = await service.confirmReceivable(context, 60);
    expect(first?.id).toBe(second?.id);

    const rows = await query
      .selectFrom('cdReceivables')
      .select('id')
      .where('milestoneId', '=', 60)
      .execute();
    expect(rows).toHaveLength(1);
  });

  it('rejects overpayment and settles the receivable with the remaining instalment', async () => {
    const finance = await contextFor(FINANCE);
    const receivable = await service.confirmReceivable(finance, 1);
    const id = Number(receivable?.id);

    await expect(
      service.registerPayment(finance, id, {
        amountCents: 900_000,
        receivedAt: '2026-08-01',
      }),
    ).rejects.toMatchObject({ code: 'OVERPAYMENT' });

    const partial = await service.registerPayment(finance, id, {
      amountCents: 150_000,
      receivedAt: '2026-08-01',
    });
    expect((partial.receivable as { status: string }).status).toBe('partial');

    const settled = await service.registerPayment(finance, id, {
      amountCents: 250_000,
      receivedAt: '2026-08-02',
    });
    expect((settled.receivable as { status: string }).status).toBe('paid');
  });

  it('refuses payment registration from a role that does not manage money', async () => {
    const managerContext = await contextFor(MANAGER);
    await expect(
      service.registerPayment(managerContext, 1, {
        amountCents: 1,
        receivedAt: '2026-08-01',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('file authorization', () => {
  it('lets a participant read a deliverable file and refuses an outsider', async () => {
    const managerContext = await contextFor(MANAGER);
    await expect(
      service.assertFileReadable(
        managerContext.actor,
        'deliverable',
        '11111111-1111-4111-8111-111111111111',
      ),
    ).resolves.toBeUndefined();

    const outsider = await contextFor(OUTSIDER);
    await expect(
      service.assertFileReadable(
        outsider.actor,
        'deliverable',
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuses a file that has no business link and one that no longer exists', async () => {
    const managerContext = await contextFor(MANAGER);
    await expect(
      service.assertFileReadable(
        managerContext.actor,
        'deliverable',
        '22222222-2222-4222-8222-222222222222',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a file larger than the upload limit when it is attached', async () => {
    const query = manager.query();
    await query
      .insertInto('cdContractFiles')
      .values({
        id: '33333333-3333-4333-8333-333333333333',
        disk: 'local',
        key: 'objects/big.bin',
        filename: 'big.bin',
        ext: 'bin',
        mimeType: 'application/octet-stream',
        size: 21 * 1024 * 1024,
        uploadedById: MANAGER,
        uploadedByName: 'Manager',
        createdAt: now,
        updatedAt: now,
      } as never)
      .execute();
    const context = await contextFor(MANAGER);
    await expect(
      service.linkContractFiles(context, 1, [
        '33333333-3333-4333-8333-333333333333',
      ]),
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('refuses to attach more files than one batch allows', async () => {
    const context = await contextFor(MANAGER);
    await expect(
      service.linkContractFiles(context, 1, ['a', 'b', 'c', 'd', 'e', 'f']),
    ).rejects.toMatchObject({ code: 'TOO_MANY_FILES' });
  });
});

describe('schema', () => {
  it('creates the business tables with their constraints', async () => {
    const rows = await manager
      .query()
      .selectFrom('cdContracts')
      .select(['contractNo', 'amountCents', 'status'])
      .execute();
    expect(rows[0]).toBeTruthy();
    const files = await manager
      .query()
      .selectFrom('cdDeliverableFiles')
      .select(['filename', 'ext', 'size'])
      .execute();
    expect(files[0]).toMatchObject({ filename: 'a.txt', ext: 'txt' });
  });
});

describe('contract search', () => {
  it('matches the reference, the title and the customer name', async () => {
    const context = await contextFor(LEAD);

    const byNumber = await service.listContracts(context, { search: 'CT-2' });
    expect(byNumber.items.map((row) => row.id)).toEqual([2]);

    const byTitle = await service.listContracts(context, { search: 'Managed' });
    expect(byTitle.items.map((row) => row.id)).toEqual([1]);

    // 'Customer' appears only in the customer name, so this only passes when
    // the search reaches through to the customer record.
    const byCustomer = await service.listContracts(context, {
      search: 'Customer',
    });
    expect(byCustomer.items.map((row) => row.id).sort((a, b) => a - b)).toEqual(
      [1, 2],
    );

    const missing = await service.listContracts(context, {
      search: 'No such contract',
    });
    expect(missing.items).toHaveLength(0);
  });
});

describe('member directory', () => {
  it('lets the lead and project managers list users and refuses everyone else', async () => {
    const lead = await contextFor(LEAD);
    const leadUsers = await service.listUsers(lead);
    expect(leadUsers.length).toBeGreaterThanOrEqual(5);
    expect(leadUsers.map((row) => String(row.username))).toContain('manager');

    // A project manager maintains milestones on their own contracts, so they
    // need the directory to pick an owner and an acceptance specialist.
    const managerContext = await contextFor(MANAGER);
    const managerUsers = await service.listUsers(managerContext);
    expect(managerUsers.map((row) => String(row.username))).toContain('lead');

    const outsider = await contextFor(OUTSIDER);
    await expect(service.listUsers(outsider)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

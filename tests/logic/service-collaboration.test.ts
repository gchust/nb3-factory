// @vitest-environment node
import type { DatabaseManager } from '@nocobase/db';
import { createDatabaseManager } from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ServiceShareService,
  ServiceShareError,
} from '../../server/service/share-service.js';
import { ServiceInspectionService } from '../../server/service/inspection-service.js';
import type { ServiceLogger } from '../../server/service/logger.js';

const migrationsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../database/main/migrations',
);

const logger: ServiceLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * Temporary collaboration and the scheduled side of the workflow, against a
 * real database.
 *
 * The share service must add a built-in sharing rule scoped to one order and
 * never share a confidential order; the inspection service must not produce a
 * second plan for the same device and day, and must remind the responsible
 * engineer and every supervisor about an overdue order.
 */
describe('service collaboration and scheduling', () => {
  let manager: DatabaseManager;
  let shareService: ServiceShareService;
  let inspectionService: ServiceInspectionService;
  let notifications: { send: ReturnType<typeof vi.fn> };
  const rules = new Map<
    string,
    {
      key: string;
      subjects: readonly unknown[];
      actions?: readonly {
        action: string;
        scopeKey?: string;
        selection?: unknown;
      }[];
    }
  >();

  beforeAll(async () => {
    manager = createDatabaseManager({
      default: 'main',
      connections: { main: sqlite({ filename: ':memory:' }) },
    });
    const migrator = manager.createMigrator({
      directory: migrationsDirectory,
      packageName: '@nocobase/app-template-default',
    });
    await migrator.latest();

    const sharingRules = {
      create: vi.fn(
        async (rule: { key: string; subjects: readonly unknown[] }) => {
          rules.set(rule.key, rule);
          return rule;
        },
      ),
      update: vi.fn(
        async (
          key: string,
          rule: { key: string; subjects: readonly unknown[] },
        ) => {
          rules.set(key, rule);
          return rule;
        },
      ),
      get: vi.fn(async (key: string) => rules.get(key)),
      delete: vi.fn(async (key: string) => {
        rules.delete(key);
      }),
      list: vi.fn(async () => [...rules.values()]),
    };
    shareService = new ServiceShareService(manager, { sharingRules } as never);
    notifications = { send: vi.fn(async () => ({ id: 'n1' })) };
    inspectionService = new ServiceInspectionService(
      manager,
      notifications as never,
      logger,
    );
  });

  afterAll(async () => {
    await manager?.destroy();
  });

  async function seedOrder(confidential = false): Promise<number> {
    const query = manager.query();
    const now = new Date();
    const customer = await query
      .insertInto('customers')
      .values({ name: 'Acme', createdAt: now, updatedAt: now })
      .execute();
    const customerId = Number(customer.insertId);
    const device = await query
      .insertInto('devices')
      .values({
        deviceNo: `D-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Analyzer',
        customerId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const deviceId = Number(device.insertId);
    const order = await query
      .insertInto('serviceOrders')
      .values({
        orderNo: `SO-${Math.random().toString(36).slice(2, 8)}`,
        title: 'Broken sensor',
        customerId,
        deviceId,
        status: 'pending_process',
        priority: 'normal',
        source: 'internal',
        confidential,
        assigneeId: 'engineer-1',
        assigneeProfileId: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return Number(order.insertId);
  }

  it('shares an ordinary order through a built-in sharing rule', async () => {
    const orderId = await seedOrder(false);
    rules.clear();

    const share = await shareService.share(
      orderId,
      'supervisor-1',
      'engineer-9',
    );
    expect(share.orderId).toBe(orderId);
    expect(share.sharedWithId).toBe('engineer-9');
    expect(share.ruleKey).toBe(`service-order-share-${orderId}-engineer-9`);

    const rule = rules.get(share.ruleKey);
    expect(rule).toBeTruthy();
    expect(rule?.subjects).toEqual([{ type: 'user', id: 'engineer-9' }]);
    // Both the engineer's `view` and the observer's `viewSummary` are opened,
    // and the shared order travels as a numeric Record Access parameter, so
    // the integer primary key is not compared against a string.
    expect(
      rule?.actions?.map((action) => `${action.action}:${action.scopeKey}`),
    ).toEqual(['view:orders', 'viewSummary:orders']);
    for (const action of rule?.actions ?? []) {
      expect(action.selection).toEqual({
        type: 'recordAccess',
        key: 'service.sharedOrder',
        params: { orderId },
      });
    }

    const listed = await shareService.list(orderId);
    expect(listed.map((item) => item.sharedWithId)).toContain('engineer-9');

    const revoked = await shareService.revoke(orderId, share.id);
    expect(revoked).toBe(true);
    expect(rules.has(share.ruleKey)).toBe(false);
    expect(await shareService.list(orderId)).toHaveLength(0);
  });

  it('refuses to share a confidential order and refuses self-sharing', async () => {
    const confidential = await seedOrder(true);
    await expect(
      shareService.share(confidential, 'supervisor-1', 'engineer-9'),
    ).rejects.toMatchObject({ code: 'CONFIDENTIAL' });

    const ordinary = await seedOrder(false);
    await expect(
      shareService.share(ordinary, 'supervisor-1', 'supervisor-1'),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(await shareService.revoke(ordinary, 999999)).toBe(false);
    expect(ServiceShareError).toBeTypeOf('function');
  });

  it('opens an inspection plan once per due device and reminds on overload', async () => {
    const query = manager.query();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    await query
      .insertInto('engineerProfiles')
      .values({
        username: 'sup-sched',
        displayName: 'Supervisor',
        appRole: 'supervisor',
        userId: 'supervisor-sched',
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const customer = await query
      .insertInto('customers')
      .values({ name: 'Sched Co', createdAt: now, updatedAt: now })
      .execute();
    const customerId = Number(customer.insertId);

    const device = await query
      .insertInto('devices')
      .values({
        deviceNo: `D-SCHED-${Math.random().toString(36).slice(2, 6)}`,
        name: 'Press',
        customerId,
        status: 'active',
        nextInspectionDate: today,
        serviceEngineerId: 'engineer-sched',
        engineerProfileId: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const deviceId = Number(device.insertId);

    const first = await inspectionService.generateDailyPlans(now);
    expect(first.created).toBe(1);

    const second = await inspectionService.generateDailyPlans(now);
    expect(second.created).toBe(0);

    const plans = await query
      .selectFrom('inspections')
      .select('id')
      .where('deviceId', '=', deviceId)
      .where('planDate', '=', today)
      .execute();
    expect(plans).toHaveLength(1);

    // The generated plan is for the due date the supervisor set; it must not
    // fabricate a future "next" date (the old +90-day cycle). Clearing the
    // date stops a second plan the next day and is the supervisor's to set.
    const after = await query
      .selectFrom('devices')
      .select('nextInspectionDate')
      .where('id', '=', deviceId)
      .executeTakeFirst();
    expect(after?.nextInspectionDate ?? null).toBeNull();

    // Completing the plan is a one-way transition.
    const inspectionId = Number(plans[0].id);
    expect(
      await inspectionService.complete(inspectionId, 'engineer-sched', '  '),
    ).toBe(false);
    expect(
      await inspectionService.complete(
        inspectionId,
        'engineer-sched',
        'checked',
      ),
    ).toBe(true);
    expect(
      await inspectionService.complete(inspectionId, 'engineer-sched', 'again'),
    ).toBe(false);

    // An overdue order reminds its assignee and every supervisor.
    const order = await query
      .insertInto('serviceOrders')
      .values({
        orderNo: `SO-OVERDUE-${Math.random().toString(36).slice(2, 6)}`,
        title: 'Late',
        customerId,
        deviceId,
        status: 'processing',
        priority: 'urgent',
        source: 'internal',
        confidential: false,
        deadline: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        assigneeId: 'engineer-sched',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    expect(order.insertId).toBeTruthy();

    const before = notifications.send.mock.calls.length;
    const result = await inspectionService.sendOverdueReminders(now);
    expect(result.reminders).toBeGreaterThanOrEqual(1);
    expect(notifications.send.mock.calls.length).toBeGreaterThan(before);
  });
});

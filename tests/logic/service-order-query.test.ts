// @vitest-environment node
import { buildRepositoryPolicy, createDatabaseManager } from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ServiceOrderQueryService } from '../../server/service/order-query-service.js';
import type { AuthorizationContext } from '@nocobase/authorization/core';

const migrationsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../database/main/migrations',
);

/**
 * The read model for the work-order list and detail, against a real database.
 *
 * Two properties are pinned here. The list treats the UI's `all` sentinel as
 * "no filter" rather than as a collection enum member, and the per-row
 * capabilities reflect the row scope: a shared order that is readable is not
 * therefore processable, so the detail page no longer offers a write its own
 * request scope would reject.
 */
describe('service order query', () => {
  let manager: ReturnType<typeof createDatabaseManager>;
  let service: ServiceOrderQueryService;
  const attachments = { list: async () => [] };

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
    service = new ServiceOrderQueryService(manager, attachments as never);
  });

  afterAll(async () => {
    await manager?.destroy();
  });

  async function seedOrder(assigneeId: string): Promise<number> {
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
        status: 'enabled',
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
        confidential: false,
        assigneeId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return Number(order.insertId);
  }

  function context(): AuthorizationContext {
    const processPolicy = buildRepositoryPolicy((policy) =>
      policy
        .read((read) =>
          read
            .scope({ assigneeId: 'eng-1' })
            .fields(
              'id',
              'orderNo',
              'title',
              'problemDescription',
              'status',
              'priority',
              'source',
              'confidential',
              'deadline',
              'createdAt',
              'updatedAt',
              'assigneeId',
              'assigneeProfileId',
              'customerId',
              'deviceId',
              'acceptedAt',
              'acceptanceNote',
              'startedAt',
              'submittedAt',
              'closedAt',
              'resolution',
              'returnReason',
              'returnCount',
            ),
        )
        .update((update) =>
          update.scope({ assigneeId: 'eng-1' }).fields('status'),
        ),
    );
    return {
      authorize: async (request: { action: string }) => {
        if (request.action === 'view') {
          return { effect: 'permit', reasons: [] };
        }
        if (request.action === 'process') {
          return {
            effect: 'conditional',
            reasons: [],
            conditions: { database: { serviceOrders: processPolicy } },
          };
        }
        return { effect: 'deny', reasons: [] };
      },
    } as unknown as AuthorizationContext;
  }

  it('ignores the list UI all sentinel instead of filtering on it', async () => {
    await seedOrder('eng-1');
    await seedOrder('eng-2');
    const rows = await service.list(context(), {
      search: '',
      status: 'all',
      priority: 'all',
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('offers processing only on the orders inside the process row scope', async () => {
    const own = await seedOrder('eng-1');
    const shared = await seedOrder('eng-2');

    const ownView = await service.detail(context(), own);
    expect(ownView?.can.view).toBe(true);
    expect(ownView?.can.process).toBe(true);

    const sharedView = await service.detail(context(), shared);
    expect(sharedView?.can.view).toBe(true);
    expect(sharedView?.can.process).toBe(false);
  });
});

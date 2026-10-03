// @vitest-environment node
import { createDatabaseManager } from '@nocobase/db';
import { sqlite } from '@nocobase/db-sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthorizationContext } from '@nocobase/authorization/core';

import { ServiceAssistantService } from '../../server/service/assistant-service.js';
import { ServiceKnowledgeService } from '../../server/service/knowledge-service.js';
import { ServiceOrderQueryService } from '../../server/service/order-query-service.js';

const migrationsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../database/main/migrations',
);

/**
 * The retrieval assistant against a real database.
 *
 * The behaviours pinned here are the ones the acceptance criteria depend on:
 * it is honest when no model is configured, it grounds an answer in records the
 * caller can see and copies a draft from them, it refuses when nothing matches
 * instead of inventing a resolution, and its conversation history is scoped to
 * the user and the order.
 */
describe('service assistant', () => {
  let manager: ReturnType<typeof createDatabaseManager>;
  let service: ServiceAssistantService;

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
    const queries = new ServiceOrderQueryService(manager, {
      list: async () => [],
    } as never);
    const knowledge = new ServiceKnowledgeService(manager);
    service = new ServiceAssistantService(manager, queries, knowledge);
  });

  afterAll(async () => {
    await manager?.destroy();
  });

  function context(): AuthorizationContext {
    return {
      authorize: async () => ({ effect: 'permit', reasons: [] }),
      can: async () => true,
    } as unknown as AuthorizationContext;
  }

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
        name: 'Injection molding machine',
        customerId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const order = await query
      .insertInto('serviceOrders')
      .values({
        orderNo: `SO-${Math.random().toString(36).slice(2, 8)}`,
        title: 'Hydraulic pressure is unstable',
        problemDescription: '压力不稳定，产品出现飞边。',
        customerId,
        deviceId: Number(device.insertId),
        status: 'processing',
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

  it('reports no model configured without failing when plugin tables are absent', async () => {
    const status = await service.status();
    expect(status.modelConfigured).toBe(false);
    expect(status.llmServices).toEqual([]);
    expect(status.knowledgeBases).toEqual([]);
  });

  it('refuses to answer without evidence instead of inventing a resolution', async () => {
    const reply = await service.ask(context(), 'eng-1', {
      question: '一个数据库里完全不存在的话题',
    });
    expect(reply.grounded).toBe(false);
    expect(reply.draft).toBe('');
    expect(reply.citations).toEqual([]);
    expect(reply.degraded).toBe(true);
  });

  it('grounds an answer in a visible order and builds a confirmable draft', async () => {
    const orderId = await seedOrder('eng-1');
    const reply = await service.ask(context(), 'eng-1', {
      question: '液压压力不稳定应该怎么处理？',
      orderId,
    });
    expect(reply.grounded).toBe(true);
    expect(reply.citations.some((citation) => citation.kind === 'order')).toBe(
      true,
    );
    expect(reply.draft).toContain('建议步骤');
    expect(reply.orderId).toBe(orderId);
  });

  it('scopes the conversation to the user and the order', async () => {
    const orderId = await seedOrder('eng-1');
    await service.ask(context(), 'eng-1', {
      question: '压力不稳',
      orderId,
    });
    const mine = await service.history('eng-1', orderId);
    expect(mine.length).toBe(2);
    expect(mine[0].role).toBe('user');
    expect(mine[1].role).toBe('assistant');

    const otherUser = await service.history('eng-2', orderId);
    expect(otherUser).toEqual([]);

    const unscoped = await service.history('eng-1');
    expect(unscoped.some((message) => message.orderId === orderId)).toBe(false);
  });
});

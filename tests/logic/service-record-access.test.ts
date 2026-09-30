// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { RecordAccessRegistry } from '@nocobase/authorization/core';

import {
  serviceMyInspections,
  serviceSharedTicket,
} from '../../server/service-resources.js';

/**
 * The temporary ticket share is granted through a sharing rule. The built-in
 * `records` selection compares the primary key as strings, and an integer
 * primary key rejects a string value, so the shared-ticket access resolves the
 * ticket id as a number through a parameter instead. These tests lock in the
 * value shape that keeps that comparison valid.
 */
describe('service record access', () => {
  it('resolves a shared ticket to a numeric primary-key comparison', async () => {
    const registry = new RecordAccessRegistry();
    registry.define(serviceSharedTicket);

    const scope = await registry.resolve('service.sharedTicket', {
      principal: { type: 'user', id: 'engineer-a1' },
      collection: 'serviceTickets',
      action: 'view',
      params: { ticketId: 1 },
    });

    expect(scope).toEqual({
      kind: 'condition',
      path: ['id'],
      operator: '$eq',
      value: 1,
    });
  });

  it('refuses a shared ticket without a usable id or for a non-user principal', async () => {
    const registry = new RecordAccessRegistry();
    registry.define(serviceSharedTicket);

    const resolve = (principal: unknown, params: unknown) =>
      registry.resolve('service.sharedTicket', {
        principal: principal as never,
        collection: 'serviceTickets',
        action: 'view',
        params,
      });

    await expect(
      resolve({ type: 'user', id: 'engineer-a1' }, {}),
    ).resolves.toBe(false);
    await expect(
      resolve(
        { type: 'user', id: 'engineer-a1' },
        { ticketId: 'not-a-number' },
      ),
    ).resolves.toBe(false);
    await expect(
      resolve({ type: 'service.team', id: '2' }, { ticketId: 1 }),
    ).resolves.toBe(false);
  });

  it('scopes my-inspections to the signed-in engineer', async () => {
    const registry = new RecordAccessRegistry();
    registry.define(serviceMyInspections);

    const scope = await registry.resolve('service.myInspections', {
      principal: { type: 'user', id: 'engineer-a1' },
      collection: 'serviceInspections',
      action: 'view',
    });

    expect(scope).toEqual({
      kind: 'condition',
      path: ['assigneeId'],
      operator: '$eq',
      value: 'engineer-a1',
    });
  });
});

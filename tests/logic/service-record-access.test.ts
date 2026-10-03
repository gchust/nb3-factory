// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { serviceRecordAccess } from '../../server/service/record-access.js';

/**
 * The Record Access resolvers the service domain registers.
 *
 * They are the half of a grant that survives as a serializable key, so their
 * keys and results are pinned here: an observer's scope must resolve to no
 * rows rather than a malformed filter, and a temporary share must address the
 * integer primary key with a number.
 */
const definitions = new Map(
  serviceRecordAccess.map((definition) => {
    const built = definition.build();
    return [built.key, built];
  }),
);

function resolve(key: string, params: unknown) {
  const definition = definitions.get(key);
  if (!definition) {
    throw new Error(`Record access ${key} is not defined.`);
  }
  return definition.resolve({
    principal: {},
    collection: 'serviceOrders',
    action: 'view',
    params,
  } as never);
}

describe('service record access', () => {
  it('registers a scope for the observer and for one shared order', () => {
    expect([...definitions.keys()]).toEqual(
      expect.arrayContaining(['service.noRecords', 'service.sharedOrder']),
    );
  });

  it('resolves the observer scope to no rows', async () => {
    expect(await resolve('service.noRecords', undefined)).toBe(false);
  });

  it('addresses a shared order by its numeric primary key', async () => {
    expect(await resolve('service.sharedOrder', { orderId: 7 })).toEqual({
      kind: 'condition',
      path: ['id'],
      operator: '$eq',
      value: 7,
    });
  });

  it('denies a shared-order scope whose parameter is missing or not a number', async () => {
    expect(await resolve('service.sharedOrder', undefined)).toBe(false);
    expect(await resolve('service.sharedOrder', { orderId: '7' })).toBe(false);
  });
});

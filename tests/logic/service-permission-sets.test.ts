import { describe, expect, it } from 'vitest';

import {
  permissionSetByRole,
  servicePermissionSets,
} from '../../database/seed-data/permission-sets.js';

/**
 * The initial business permission sets.
 *
 * These are the grants an administrator starts from, so the boundaries they
 * encode are business rules and are pinned here: an engineer never gains the
 * ledger, an observer never gains knowledge or inspections, and only a
 * supervisor may manage repair knowledge or supervise shares.
 */
interface FlatGrant {
  readonly key: string;
  readonly resource: string;
  readonly action: string;
}

function flatten(): readonly FlatGrant[] {
  return servicePermissionSets.flatMap((set) =>
    set.grants.flatMap((grant) =>
      grant.actions.map((action) => ({
        key: set.key,
        resource: `${grant.resource.type}:${grant.resource.id}`,
        action: action.action,
      })),
    ),
  );
}

function setOf(key: string) {
  const set = servicePermissionSets.find((candidate) => candidate.key === key);
  if (!set) {
    throw new Error(`Permission set ${key} is not defined.`);
  }
  return set;
}

function resourcesOf(key: string): ReadonlySet<string> {
  return new Set(
    setOf(key).grants.map(
      (grant) => `${grant.resource.type}:${grant.resource.id}`,
    ),
  );
}

function actionsOf(key: string, resource: string): ReadonlySet<string> {
  const actions = setOf(key)
    .grants.filter(
      (grant) => `${grant.resource.type}:${grant.resource.id}` === resource,
    )
    .flatMap((grant) => grant.actions.map((action) => action.action));
  return new Set(actions);
}

describe('service permission sets', () => {
  it('maps every demo role to its own set', () => {
    expect(permissionSetByRole).toMatchObject({
      supervisor: 'service-supervisor',
      engineer: 'service-engineer',
      observer: 'service-observer',
      integration: 'service-integration',
    });
    expect(new Set(servicePermissionSets.map((set) => set.key)).size).toBe(
      servicePermissionSets.length,
    );
  });

  it('grants the supervisor the ledger, orders, knowledge and inspections', () => {
    const resources = resourcesOf('service-supervisor');
    expect(resources).toContain('page:service.ledger');
    expect(resources).toContain('composite:service.ledger');
    expect(resources).toContain('composite:service.orders');
    expect(resources).toContain('composite:service.knowledge');
    expect(resources).toContain('composite:service.inspections');
  });

  it('keeps an engineer out of the ledger and out of supervision', () => {
    const resources = resourcesOf('service-engineer');
    expect(resources).not.toContain('page:service.ledger');
    expect(resources).not.toContain('composite:service.ledger');
    expect(resources).not.toContain('composite:service.knowledge:manage');

    const orderActions = actionsOf(
      'service-engineer',
      'composite:service.orders',
    );
    expect(orderActions).toContain('view');
    expect(orderActions).toContain('process');
    expect(orderActions).toContain('attach');
    expect(orderActions).not.toContain('supervise');
    expect(orderActions).not.toContain('create');
  });

  it('lets an observer see a summary and nothing else', () => {
    const resources = resourcesOf('service-observer');
    expect(resources).toContain('page:service.orders');
    expect(resources).not.toContain('composite:service.knowledge');
    expect(resources).not.toContain('composite:service.inspections');
    expect(resources).not.toContain('composite:service.ledger');

    const orderActions = actionsOf(
      'service-observer',
      'composite:service.orders',
    );
    expect([...orderActions]).toEqual(['viewSummary']);
  });

  it('gives an observer a permitted but empty order scope', () => {
    const grant = setOf('service-observer').grants.find(
      (entry) =>
        `${entry.resource.type}:${entry.resource.id}` ===
        'composite:service.orders',
    );
    expect(grant?.actions.map((action) => action.action)).toEqual([
      'viewSummary',
    ]);
    // The empty string selects nothing and the default scope is not applied,
    // so a bare observer reaches no order without an explicit share.
    expect(grant?.actions[0]?.policy).toEqual({
      type: 'composite',
      scopes: { orders: 'service.noRecords' },
    });
  });

  it('keeps the integration user to submitting device reports', () => {
    const resources = resourcesOf('service-integration');
    expect([...resources]).toEqual(['composite:service.deviceReports']);
    expect(
      actionsOf('service-integration', 'composite:service.deviceReports'),
    ).toEqual(new Set(['submit']));
  });

  it('gives every business role the message center, but not the integration user', () => {
    expect(resourcesOf('service-supervisor')).toContain(
      'page:service.messages',
    );
    expect(resourcesOf('service-engineer')).toContain('page:service.messages');
    expect(resourcesOf('service-observer')).toContain('page:service.messages');
    expect(resourcesOf('service-integration')).not.toContain(
      'page:service.messages',
    );
  });

  it('only grants knowledge management to a supervisor', () => {
    const manages = flatten().filter(
      (grant) =>
        grant.resource === 'composite:service.knowledge' &&
        grant.action === 'manage',
    );
    expect(manages.map((grant) => grant.key)).toEqual(['service-supervisor']);
  });
});

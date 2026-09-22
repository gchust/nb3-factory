import { describe, expect, it } from 'vitest';

import {
  SERVICE_PERMISSION_SETS,
  SERVICE_PAGES,
  SERVICE_RESOURCES,
  buildServicePermissionSets,
  serviceAuthorization,
} from '../../server/service-authorization.js';

function grantsFor(
  sets: ReturnType<typeof buildServicePermissionSets>,
  key: string,
) {
  const set = sets.find((item) => item.key === key);
  if (!set) throw new Error(`Missing permission set ${key}`);
  return set.grants;
}

function can(
  sets: ReturnType<typeof buildServicePermissionSets>,
  key: string,
  type: 'page' | 'resource',
  id: string,
  action: string,
): boolean {
  return grantsFor(sets, key).some(
    (grant) =>
      grant.resource.type === type &&
      grant.resource.id === id &&
      grant.actions.some((item) => item.action === action),
  );
}

describe('service permission model', () => {
  it('seeds one permission set for every business role', () => {
    const sets = buildServicePermissionSets();
    expect(sets.map((item) => item.key).sort()).toEqual(
      [...SERVICE_PERMISSION_SETS].map((item) => item.key).sort(),
    );
    expect(sets).toHaveLength(6);
    for (const key of [
      'service-admin',
      'service-manager',
      'service-engineer',
      'service-collaborator',
      'service-observer',
      'service-integration',
    ]) {
      expect(sets.some((item) => item.key === key)).toBe(true);
    }
  });

  it('grants the administrator every page and ticket action', () => {
    const sets = buildServicePermissionSets();
    for (const page of SERVICE_PAGES) {
      expect(can(sets, 'service-admin', 'page', page.id, 'access')).toBe(true);
    }
    for (const action of [
      'view',
      'create',
      'edit',
      'assign',
      'process',
      'confirm',
      'transfer',
      'share',
    ]) {
      expect(
        can(sets, 'service-admin', 'resource', 'service.tickets', action),
      ).toBe(true);
    }
  });

  it('does not give the supervisor the service team page', () => {
    const sets = buildServicePermissionSets();
    expect(
      can(sets, 'service-manager', 'page', 'service.tickets', 'access'),
    ).toBe(true);
    expect(
      can(sets, 'service-manager', 'page', 'service.members', 'access'),
    ).toBe(false);
  });

  it('scopes the regional engineer to service actions but not assignment', () => {
    const sets = buildServicePermissionSets();
    expect(
      can(sets, 'service-engineer', 'resource', 'service.tickets', 'process'),
    ).toBe(true);
    expect(
      can(sets, 'service-engineer', 'resource', 'service.tickets', 'assign'),
    ).toBe(false);
    expect(
      can(sets, 'service-engineer', 'resource', 'service.customers', 'manage'),
    ).toBe(false);
    expect(
      can(sets, 'service-engineer', 'page', 'service.members', 'access'),
    ).toBe(false);
  });

  it('keeps the external integration account off every page', () => {
    const sets = buildServicePermissionSets();
    for (const page of SERVICE_PAGES) {
      expect(can(sets, 'service-integration', 'page', page.id, 'access')).toBe(
        false,
      );
    }
    expect(
      can(
        sets,
        'service-integration',
        'resource',
        'service.integration',
        'consume',
      ),
    ).toBe(true);
    expect(
      can(sets, 'service-integration', 'resource', 'service.tickets', 'create'),
    ).toBe(true);
  });

  it('only references actions declared by a business resource', () => {
    const declared = new Map(
      SERVICE_RESOURCES.map((resource) => [
        resource.name,
        new Set(resource.actions.map((item) => item.name)),
      ]),
    );
    for (const set of buildServicePermissionSets()) {
      for (const grant of set.grants) {
        if (grant.resource.type !== 'resource') continue;
        const actions = declared.get(grant.resource.id);
        expect(actions, `unknown resource ${grant.resource.id}`).toBeTruthy();
        for (const item of grant.actions) {
          expect(
            actions?.has(item.action),
            `${grant.resource.id}.${item.action}`,
          ).toBe(true);
        }
      }
    }
  });

  it('gives the read-only observer a cross-region record grant', () => {
    const sets = buildServicePermissionSets();
    expect(
      can(sets, 'service-observer', 'resource', 'service.records', 'viewAll'),
    ).toBe(true);
    expect(
      can(sets, 'service-engineer', 'resource', 'service.records', 'viewAll'),
    ).toBe(false);
    expect(
      can(
        sets,
        'service-collaborator',
        'resource',
        'service.records',
        'viewAll',
      ),
    ).toBe(false);
  });

  it('registers the business resources on the authorization instance', () => {
    const added: {
      readonly name: string;
      readonly actions: readonly { name: string }[];
    }[] = [];
    const authz = {
      resourceGroups: { add: () => undefined },
      resources: {
        add: (resource: (typeof added)[number]) => added.push(resource),
      },
    };
    serviceAuthorization().setup(authz as never);
    const tickets = added.find((item) => item.name === 'service.tickets');
    expect(tickets).toBeTruthy();
    expect(tickets?.actions.map((item) => item.name)).toEqual([
      'view',
      'create',
      'edit',
      'assign',
      'process',
      'confirm',
      'transfer',
      'share',
    ]);
  });
});

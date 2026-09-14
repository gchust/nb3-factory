import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { AppAuthorization } from '@nocobase/app-plugin-authorization';
import { describe, expect, it } from 'vitest';

import {
  APPLICATION_ROLES,
  ensureApplicationRoles,
} from '../../server/providers/production-roles.js';

interface StoredSet {
  key: string;
  title?: string;
  grants: readonly {
    resource: { type: string; id: string };
    actions: readonly { action: string; policy?: unknown }[];
  }[];
}

function pageIds(set: StoredSet): string[] {
  return set.grants
    .filter((grant) => grant.resource.type === 'page')
    .map((grant) => grant.resource.id)
    .sort();
}

function harness(initial: readonly StoredSet[]) {
  const sets = new Map(
    initial.map((set) => [set.key, structuredClone(set) as StoredSet]),
  );
  const permissionSets = {
    get: async (key: string) => sets.get(key),
    create: async (input: StoredSet) => {
      sets.set(input.key, structuredClone(input));
      return sets.get(input.key);
    },
    update: async (key: string, input: StoredSet) => {
      sets.set(key, structuredClone(input));
      return sets.get(key);
    },
  };
  return {
    authorization: { permissionSets } as unknown as Pick<
      AppAuthorization,
      'permissionSets'
    >,
    sets,
  };
}

describe('application role permission sets', () => {
  it('creates each role with page access grants', async () => {
    const { authorization, sets } = harness([]);
    await ensureApplicationRoles(authorization);

    expect([...sets.keys()].sort()).toEqual([
      'production-supervisor',
      'quality-inspector',
      'team-leader',
    ]);
    for (const role of APPLICATION_ROLES) {
      expect(pageIds(sets.get(role.key)!)).toEqual([...role.pages].sort());
    }
  });

  it('gives a team leader work-order pages but not statistics', async () => {
    const { authorization, sets } = harness([]);
    await ensureApplicationRoles(authorization);

    const leader = pageIds(sets.get('team-leader')!);
    expect(leader).toContain('productionWorkOrders');
    expect(leader).toContain('productionWorkOrderDetail');
    expect(leader).not.toContain('productionStatistics');

    const inspector = pageIds(sets.get('quality-inspector')!);
    expect(inspector).toContain('productionDefects');
    expect(inspector).toContain('productionWorkOrders');

    const supervisor = pageIds(sets.get('production-supervisor')!);
    expect(supervisor).toContain('productionStatistics');
    expect(supervisor).toContain('productionProducts');
  });

  it('repairs a role created with empty grants and keeps extra grants', async () => {
    const { authorization, sets } = harness([
      {
        key: 'team-leader',
        title: 'Team leader',
        grants: [],
      },
      {
        key: 'quality-inspector',
        title: 'Quality inspector',
        grants: [
          {
            resource: { type: 'page', id: 'home' },
            actions: [{ action: 'access' }],
          },
          {
            resource: { type: 'page', id: 'productionDefects' },
            actions: [{ action: 'access' }],
          },
        ],
      },
    ]);
    await ensureApplicationRoles(authorization);

    expect(pageIds(sets.get('team-leader')!)).toEqual(
      [...APPLICATION_ROLES[1].pages].sort(),
    );
    // The existing home and defects grants are preserved, not replaced.
    expect(pageIds(sets.get('quality-inspector')!)).toEqual(
      [...new Set([...APPLICATION_ROLES[2].pages, 'home'])].sort(),
    );
  });

  it('is idempotent', async () => {
    const { authorization, sets } = harness([]);
    await ensureApplicationRoles(authorization);
    const first = structuredClone([...sets.entries()]);
    await ensureApplicationRoles(authorization);
    expect([...sets.entries()]).toEqual(first);
  });

  it('grants every production page route to at least one role', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'client/routes.ts'),
      'utf8',
    );
    const routeNames = [
      ...source.matchAll(/name: '(production[A-Za-z]+)'/g),
    ].map((match) => match[1]);
    expect(routeNames.length).toBeGreaterThan(0);
    const granted = new Set(APPLICATION_ROLES.flatMap((role) => role.pages));
    for (const routeName of routeNames) {
      expect(granted.has(routeName)).toBe(true);
    }
  });
});

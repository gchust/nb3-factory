import type { AppAuthorization } from '@nocobase/app-plugin-authorization';
import { describe, expect, it, vi } from 'vitest';

import {
  INSPECTION_PAGE_NAMES,
  INSPECTION_ROLES,
  resolveUserRole,
} from '../../server/providers/inspection-roles.js';

/**
 * `ensureInspectionRoles` memoizes its work per module instance, so each test
 * has to load a fresh copy or it would silently observe the first test's no-op.
 */
async function freshEnsure(): Promise<
  (typeof import('../../server/providers/inspection-roles.js'))['ensureInspectionRoles']
> {
  vi.resetModules();
  const module = await import('../../server/providers/inspection-roles.js');
  return module.ensureInspectionRoles;
}

interface Assignment {
  readonly subject: { readonly type: string; readonly id: string };
  readonly permissionSet: string;
}

interface Grant {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly { readonly action: string }[];
}

interface StoredSet {
  readonly key: string;
  readonly title?: string;
  readonly grants: readonly Grant[];
}

function authorizationWith(
  assignments: readonly Assignment[],
  initialSets: readonly StoredSet[] = [],
) {
  const created: string[] = [];
  const updated: string[] = [];
  const sets = new Map(initialSets.map((set) => [set.key, set]));
  const permissionSets = {
    listAssignments: vi.fn(async () => assignments),
    get: vi.fn(async (key: string) => sets.get(key)),
    create: vi.fn(async (input: StoredSet) => {
      created.push(input.key);
      sets.set(input.key, input);
      return input;
    }),
    update: vi.fn(async (_key: string, input: StoredSet) => {
      updated.push(input.key);
      sets.set(input.key, input);
      return input;
    }),
  };
  return {
    created,
    updated,
    sets,
    authorization: { permissionSets } as unknown as Pick<
      AppAuthorization,
      'permissionSets'
    >,
  };
}

const pageIds = (set: StoredSet | undefined): readonly string[] =>
  (set?.grants ?? [])
    .filter((grant) => grant.resource.type === 'page')
    .map((grant) => grant.resource.id)
    .sort();

describe('resolveUserRole', () => {
  const cases: readonly [string, string][] = [
    ['system-administrator', 'admin'],
    [INSPECTION_ROLES.teamLead, 'teamLead'],
    [INSPECTION_ROLES.inspector, 'inspector'],
    [INSPECTION_ROLES.viewer, 'viewer'],
    ['unrelated-set', 'none'],
  ];

  it.each(cases)('maps %s to %s', async (permissionSet, expected) => {
    const { authorization } = authorizationWith([
      { subject: { type: 'user', id: 'user-1' }, permissionSet },
    ]);
    await expect(resolveUserRole(authorization, 'user-1')).resolves.toBe(
      expected,
    );
  });

  it('ignores assignments belonging to another user', async () => {
    const { authorization } = authorizationWith([
      {
        subject: { type: 'user', id: 'user-2' },
        permissionSet: INSPECTION_ROLES.inspector,
      },
    ]);
    await expect(resolveUserRole(authorization, 'user-1')).resolves.toBe(
      'none',
    );
  });

  it('prefers the administrator role over an inspection role', async () => {
    const { authorization } = authorizationWith([
      {
        subject: { type: 'user', id: 'user-1' },
        permissionSet: INSPECTION_ROLES.inspector,
      },
      {
        subject: { type: 'user', id: 'user-1' },
        permissionSet: 'system-administrator',
      },
    ]);
    await expect(resolveUserRole(authorization, 'user-1')).resolves.toBe(
      'admin',
    );
  });

  it('treats an unassigned user as having no role', async () => {
    const { authorization } = authorizationWith([]);
    await expect(resolveUserRole(authorization, 'user-1')).resolves.toBe(
      'none',
    );
  });
});

describe('ensureInspectionRoles', () => {
  it('creates the three inspection permission sets once', async () => {
    const ensureInspectionRoles = await freshEnsure();
    const first = authorizationWith([]);
    await ensureInspectionRoles(first.authorization);
    expect(first.created).toEqual([
      INSPECTION_ROLES.inspector,
      INSPECTION_ROLES.teamLead,
      INSPECTION_ROLES.viewer,
    ]);
    const second = authorizationWith([]);
    await ensureInspectionRoles(second.authorization);
    // Memoized: the second call must not touch the store again.
    expect(second.created).toEqual([]);
  });

  it('grants every role the pages it needs to open', async () => {
    const ensureInspectionRoles = await freshEnsure();
    const sets = authorizationWith([]);
    await ensureInspectionRoles(sets.authorization);

    const readable = Object.values(INSPECTION_PAGE_NAMES).sort();
    expect(pageIds(sets.sets.get(INSPECTION_ROLES.inspector))).toEqual(
      readable,
    );
    expect(pageIds(sets.sets.get(INSPECTION_ROLES.teamLead))).toEqual(readable);
    expect(pageIds(sets.sets.get(INSPECTION_ROLES.viewer))).toEqual(
      readable.filter((page) => page !== INSPECTION_PAGE_NAMES.recordNew),
    );
    // Every grant is the `access` action the client route check performs.
    for (const role of Object.values(INSPECTION_ROLES)) {
      const grants = sets.sets.get(role)?.grants ?? [];
      expect(grants.length).toBeGreaterThan(0);
      for (const grant of grants) {
        expect(grant.resource.type).toBe('page');
        expect(grant.actions).toEqual([{ action: 'access' }]);
      }
    }
  });

  it('adds the page grants to a role set that predates them', async () => {
    const ensureInspectionRoles = await freshEnsure();
    const existing = {
      key: INSPECTION_ROLES.inspector,
      title: 'Inspection inspector',
      grants: [],
    };
    const authorization = authorizationWith([], [existing]);
    await ensureInspectionRoles(authorization.authorization);

    expect(authorization.updated).toEqual([INSPECTION_ROLES.inspector]);
    expect(pageIds(authorization.sets.get(INSPECTION_ROLES.inspector))).toEqual(
      Object.values(INSPECTION_PAGE_NAMES).sort(),
    );
  });

  it('leaves a role set whose grants are already correct untouched', async () => {
    const ensureInspectionRoles = await freshEnsure();
    const sets = authorizationWith([]);
    await ensureInspectionRoles(sets.authorization);
    // A second module instance sees the stored sets and must not rewrite them.
    const reloaded = await freshEnsure();
    await reloaded(sets.authorization);
    expect(sets.updated).toEqual([]);
  });
});

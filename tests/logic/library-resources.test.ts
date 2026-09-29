// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { librarian, reader } from '../../database/seed-data/permission-sets.js';
import {
  LIBRARY_NAMESPACE,
  MATERIALS_COLLECTION,
  MATERIALS_PAGE,
  MATERIALS_SCOPE,
  materials,
  nonConfidentialAccess,
  publishedAccess,
  RECORD_ACCESS_NON_CONFIDENTIAL,
  RECORD_ACCESS_OWNED,
  RECORD_ACCESS_PUBLISHED,
} from '../../server/library/resources.js';

/**
 * Guards the declaration the seeds and the server route both depend on. The keys and scope values here are persisted
 * as JSON by the installation seeds; a rename that is not mirrored in `database/seed-data/permission-sets.ts`, the
 * restriction-rule seed or the client's `useCan` checks would break access silently instead of failing a type check.
 */

const definition = materials.build();

function action(name: string) {
  const found = definition.actions.find((entry) => entry.name === name);
  if (!found) throw new Error(`Missing composite action ${name}`);
  return found;
}

function scopeOptions(name: string) {
  return (
    action(name).dataScopes?.find((scope) => scope.key === MATERIALS_SCOPE)
      ?.options ?? []
  );
}

describe('library composite resource', () => {
  it('names the one business collection and page', () => {
    expect(LIBRARY_NAMESPACE).toBe('nb3-factory');
    expect(MATERIALS_COLLECTION).toBe('materials');
    expect(MATERIALS_PAGE).toBe('materials');
    expect(MATERIALS_SCOPE).toBe('materials');
    expect(definition.name).toBe('library.materials');
    expect(definition.actions.map((entry) => entry.name)).toEqual([
      'view',
      'create',
      'edit',
      'delete',
    ]);
  });

  it('binds every action to the same data scope, defaulting to the owner', () => {
    for (const name of ['view', 'create', 'edit', 'delete']) {
      const scope = action(name).dataScopes?.find(
        (entry) => entry.key === MATERIALS_SCOPE,
      );
      expect(scope).toBeDefined();
      expect(scope?.defaultValue).toBe(RECORD_ACCESS_OWNED);
    }
  });

  it('offers a reader only the published scope on view', () => {
    expect(scopeOptions('view')).toEqual([
      RECORD_ACCESS_OWNED,
      RECORD_ACCESS_PUBLISHED,
      RECORD_ACCESS_NON_CONFIDENTIAL,
    ]);
  });

  it('keeps the writer actions owner-only so a view grant cannot be widened', () => {
    for (const name of ['create', 'edit', 'delete']) {
      expect(scopeOptions(name)).toEqual([RECORD_ACCESS_OWNED]);
    }
  });

  it('requires reading the record a write returns', () => {
    for (const name of ['create', 'edit', 'delete']) {
      const actions = action(name).grants.flatMap((grant) =>
        grant.actions.map((entry) => entry.action),
      );
      expect(actions).toContain('read');
    }
  });

  it('declares record access that matches the two flags', () => {
    expect(publishedAccess.build().key).toBe(RECORD_ACCESS_PUBLISHED);
    expect(publishedAccess.build().collections).toEqual([MATERIALS_COLLECTION]);
    expect(publishedAccess.build().resolve({})).toEqual({
      kind: 'filter',
      version: 1,
      root: {
        kind: 'group',
        logic: 'and',
        items: [
          { kind: 'condition', path: ['published'], operator: '$isTruly' },
          { kind: 'condition', path: ['confidential'], operator: '$isFalsy' },
        ],
      },
    });

    expect(nonConfidentialAccess.build().key).toBe(
      RECORD_ACCESS_NON_CONFIDENTIAL,
    );
    expect(nonConfidentialAccess.build().collections).toEqual([
      MATERIALS_COLLECTION,
    ]);
    expect(nonConfidentialAccess.build().resolve({})).toEqual({
      kind: 'filter',
      version: 1,
      root: {
        kind: 'group',
        logic: 'and',
        items: [
          { kind: 'condition', path: ['confidential'], operator: '$isFalsy' },
        ],
      },
    });
  });
});

describe('library permission sets', () => {
  it('grants 资料员 the page and every owner-scoped operation', () => {
    expect(librarian.key).toBe('library-librarian');
    expect(librarian.title).toEqual({
      key: 'library.role.librarian',
      ns: LIBRARY_NAMESPACE,
    });
    expect(librarian.grants[0]).toEqual({
      resource: { type: 'page', id: MATERIALS_PAGE },
      actions: [{ action: 'access' }],
    });
    expect(librarian.grants[1]).toEqual({
      resource: { type: 'composite', id: 'library.materials' },
      actions: ['view', 'create', 'edit', 'delete'].map((name) => ({
        action: name,
        policy: {
          type: 'composite',
          scopes: { [MATERIALS_SCOPE]: RECORD_ACCESS_OWNED },
        },
      })),
    });
  });

  it('grants 阅读者 the page and view-only access to the published scope', () => {
    expect(reader.key).toBe('library-reader');
    expect(reader.title).toEqual({
      key: 'library.role.reader',
      ns: LIBRARY_NAMESPACE,
    });
    expect(reader.grants[0]).toEqual({
      resource: { type: 'page', id: MATERIALS_PAGE },
      actions: [{ action: 'access' }],
    });
    expect(reader.grants[1]).toEqual({
      resource: { type: 'composite', id: 'library.materials' },
      actions: [
        {
          action: 'view',
          policy: {
            type: 'composite',
            scopes: { [MATERIALS_SCOPE]: RECORD_ACCESS_PUBLISHED },
          },
        },
      ],
    });
    expect(reader.grants[1].actions.map((entry) => entry.action)).toEqual([
      'view',
    ]);
  });
});

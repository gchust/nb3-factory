// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  KNOWLEDGE_ASSISTANT_PAGE as CLIENT_ASSISTANT_PAGE,
  KNOWLEDGE_MATERIALS_COLLECTION as CLIENT_COLLECTION,
  KNOWLEDGE_MATERIALS_PAGE as CLIENT_MATERIALS_PAGE,
  KNOWLEDGE_MATERIALS_RESOURCE as CLIENT_RESOURCE,
} from '../../client/knowledge.ts';
import {
  KNOWLEDGE_COLLEAGUE_MATERIAL_IDS,
  KNOWLEDGE_COLLEAGUE_SET,
  KNOWLEDGE_MATERIALS,
  KNOWLEDGE_SUPERVISOR_SET,
  KNOWLEDGE_USERS,
  knowledgeColleagueGrants,
  knowledgeSupervisorGrants,
} from '../../database/seed-data/knowledge.ts';
import {
  KNOWLEDGE_ASSISTANT_PAGE,
  KNOWLEDGE_MATERIALS_COLLECTION,
  KNOWLEDGE_MATERIALS_PAGE,
  KNOWLEDGE_MATERIALS_RESOURCE,
  KNOWLEDGE_MATERIALS_SCOPE,
} from '../../server/knowledge/resources.ts';

/**
 * The permission difference this feature exists for, pinned where it is decided.
 *
 * The failure this guards against is not a broken page: it is a colleague's grant quietly widening to `all`, or the
 * two identifier lists drifting apart so the page looks up one page id while the seed stores another. Both are
 * invisible at runtime — the page still renders and the assistant still answers — and both let a colleague see a
 * material that is supposed to be supervisor-only. The end-to-end behavior is verified against a real server
 * separately; this is the cheap check that the stored shape says what it should.
 */

interface CompositeScope {
  type: string;
  ids?: string[];
}

interface GrantAction {
  action: string;
  policy?: { type: string; scopes?: Record<string, CompositeScope> };
}

interface Grant {
  resource: { type: string; id: string };
  actions: GrantAction[];
}

const compositeGrant = (grants: readonly unknown[]): Grant => {
  const grant = (grants as Grant[]).find(
    (candidate) => candidate.resource.type === 'composite',
  );
  if (!grant) throw new Error('No composite grant in the permission set.');
  return grant;
};

const scopeOf = (grant: Grant, action: string): CompositeScope => {
  const found = grant.actions.find((candidate) => candidate.action === action);
  const scope = found?.policy?.scopes?.[KNOWLEDGE_MATERIALS_SCOPE];
  if (!scope) throw new Error(`No ${action} scope in the composite grant.`);
  return scope;
};

describe('knowledge materials fixtures', () => {
  it('keeps the three materials the requirement names', () => {
    expect(KNOWLEDGE_MATERIALS.map((material) => material.id)).toEqual([
      'knowledge-material-a',
      'knowledge-material-b',
      'knowledge-material-c',
    ]);
    expect(KNOWLEDGE_MATERIALS[0].content).toContain('400-000-7316');
    expect(KNOWLEDGE_MATERIALS[1].content).toContain('45');
    expect(KNOWLEDGE_MATERIALS[2].content).toContain('729');
  });

  it('keeps the colleague scope to exactly the two shareable materials', () => {
    expect(KNOWLEDGE_COLLEAGUE_MATERIAL_IDS).toEqual([
      'knowledge-material-a',
      'knowledge-material-b',
    ]);
    expect(KNOWLEDGE_COLLEAGUE_MATERIAL_IDS).not.toContain(
      'knowledge-material-c',
    );
  });

  it('isolates the two accounts by permission set alone', () => {
    expect(KNOWLEDGE_USERS.map((user) => user.permissionSet)).toEqual([
      KNOWLEDGE_SUPERVISOR_SET,
      KNOWLEDGE_COLLEAGUE_SET,
    ]);
    expect(
      new Set(KNOWLEDGE_USERS.map((user) => user.permissionSet)).size,
    ).toBe(2);
  });
});

describe('knowledge permission sets', () => {
  it('lets a colleague view only the two named materials and never edit', () => {
    const grants = knowledgeColleagueGrants();
    const composite = compositeGrant(grants);

    expect(composite.resource.id).toBe(KNOWLEDGE_MATERIALS_RESOURCE);
    expect(composite.actions.map((action) => action.action)).toEqual(['view']);
    expect(scopeOf(composite, 'view')).toEqual({
      type: 'records',
      ids: ['knowledge-material-a', 'knowledge-material-b'],
    });
  });

  it('lets a supervisor view and edit every material', () => {
    const composite = compositeGrant(knowledgeSupervisorGrants());

    expect(composite.resource.id).toBe(KNOWLEDGE_MATERIALS_RESOURCE);
    expect(composite.actions.map((action) => action.action).sort()).toEqual([
      'edit',
      'view',
    ]);
    expect(scopeOf(composite, 'view')).toEqual({ type: 'all' });
    expect(scopeOf(composite, 'edit')).toEqual({ type: 'all' });
  });

  it('grants both business pages to both roles', () => {
    for (const grants of [
      knowledgeColleagueGrants(),
      knowledgeSupervisorGrants(),
    ]) {
      const pageIds = (grants as Grant[])
        .filter((grant) => grant.resource.type === 'page')
        .map((grant) => grant.resource.id);
      expect(pageIds).toEqual(
        expect.arrayContaining([
          KNOWLEDGE_MATERIALS_PAGE,
          KNOWLEDGE_ASSISTANT_PAGE,
        ]),
      );
    }
  });
});

describe('the mirrored client contract', () => {
  it('agrees with the server on every stored identifier', () => {
    expect(CLIENT_MATERIALS_PAGE).toBe(KNOWLEDGE_MATERIALS_PAGE);
    expect(CLIENT_ASSISTANT_PAGE).toBe(KNOWLEDGE_ASSISTANT_PAGE);
    expect(CLIENT_RESOURCE).toBe(KNOWLEDGE_MATERIALS_RESOURCE);
    expect(CLIENT_COLLECTION).toBe(KNOWLEDGE_MATERIALS_COLLECTION);
  });
});

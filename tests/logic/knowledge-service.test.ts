// @vitest-environment node
import type {
  Authorization,
  AuthorizationContext,
  AuthorizationDecision,
} from '@nocobase/authorization/core';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import type { DatabaseManager } from '@nocobase/db';
import { describe, expect, it, vi } from 'vitest';

import {
  KNOWLEDGE_DOCUMENTS_COLLECTION,
  KNOWLEDGE_DOCUMENTS_RESOURCE,
  type KnowledgeDocument,
} from '../../server/knowledge-resources.js';
import { createKnowledgeService } from '../../server/knowledge-service.js';

const readPolicy = {
  collection: KNOWLEDGE_DOCUMENTS_COLLECTION,
  read: ['id', 'title', 'body', 'visibility'],
};
const managePolicy = { ...readPolicy, update: ['title', 'body'] };

const repair = document(1, '蓝鹭设备报修电话', '设备报修请拨打 400-000-7316。');
const inspection = document(2, '蓝鹭设备巡检要求', '常规巡检间隔为 45 天。');
const secret = document(
  3,
  '保密项目代号',
  '保密项目的内部代号为墨竹 729。',
  'restricted',
);

function document(
  id: number,
  title: string,
  body: string,
  visibility: 'public' | 'restricted' = 'public',
): KnowledgeDocument {
  return {
    id,
    title,
    body,
    visibility,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

/** A composite decision carrying one Repository Policy for the documents collection. */
function decision(
  effect: 'permit' | 'deny',
  policy?: unknown,
): AuthorizationDecision {
  return {
    effect,
    ...(effect === 'permit'
      ? {
          conditions: {
            database: { [KNOWLEDGE_DOCUMENTS_COLLECTION]: policy },
          },
        }
      : {}),
    reasons: [],
  } as AuthorizationDecision;
}

interface ContextCall {
  readonly resource: { type: string; id: string };
  readonly action: string;
}

/** A hand context whose single decision the test chooses, recording what it was asked. */
function contextFor(authorized: AuthorizationDecision): {
  context: AuthorizationContext;
  calls: ContextCall[];
} {
  const calls: ContextCall[] = [];
  const context = {
    identity: { principal: { type: 'user', id: 'test' }, subjects: [] },
    async authorize(request: ContextCall) {
      calls.push(request);
      return authorized;
    },
  } as unknown as AuthorizationContext;
  return { context, calls };
}

interface RepositoryState {
  names: string[];
  policy: unknown;
  updates: Partial<KnowledgeDocument>[];
}

/** An in-memory stand-in for the scoped repository the policy would produce. */
function createRepository(rows: KnowledgeDocument[]) {
  const state: RepositoryState = { names: [], policy: undefined, updates: [] };
  const repository = {
    withPolicy(policy: unknown) {
      state.policy = policy;
      return repository;
    },
    async findMany() {
      return [...rows];
    },
    async findOne({ filter }: { filter: { id: number } }) {
      return rows.find((row) => row.id === filter.id);
    },
    async updateOne({
      filter,
      values,
    }: {
      filter: { id: number };
      values: Partial<KnowledgeDocument>;
    }) {
      state.updates.push(values);
      const row = rows.find((candidate) => candidate.id === filter.id);
      if (row) {
        Object.assign(row, values);
      }
      return { affectedRows: row ? 1 : 0 };
    },
  };
  const database = {
    repository(name: string) {
      state.names.push(name);
      return repository;
    },
  };
  return { database: database as unknown as DatabaseManager, state };
}

/** Only the identity helpers matter here; the service never touches them elsewhere. */
const unusedAuthorization = {
  subjects: { resolveFor: async () => [] },
  for: () => ({}) as AuthorizationContext,
} as unknown as Authorization;

describe('KnowledgeService identity', () => {
  it('builds a hand context for an actor that carries the authenticated subject', async () => {
    const authorization = {
      subjects: {
        resolveFor: vi.fn(async () => [{ type: 'user', id: '7' }]),
      },
      for: vi.fn(
        (identity: unknown) =>
          ({ identity }) as unknown as AuthorizationContext,
      ),
    } as unknown as Authorization;
    const service = createKnowledgeService(
      { repository: () => undefined } as unknown as DatabaseManager,
      authorization,
    );

    await service.contextForActor({ id: 7 });

    expect(authorization.subjects.resolveFor).toHaveBeenCalledWith({
      type: 'user',
      id: '7',
    });
    expect(authorization.for).toHaveBeenCalledWith({
      principal: { type: 'user', id: '7' },
      subjects: [
        { type: 'authenticated', id: '*' },
        { type: 'user', id: '7' },
      ],
    });
  });
});

describe('KnowledgeService reads', () => {
  it('checks the read action and runs the query under the granted policy', async () => {
    const { database, state } = createRepository([repair, inspection]);
    const service = createKnowledgeService(database, unusedAuthorization);
    const { context, calls } = contextFor(decision('permit', readPolicy));

    const documents = await service.listDocuments(context);

    expect(calls).toEqual([
      {
        resource: { type: 'composite', id: KNOWLEDGE_DOCUMENTS_RESOURCE },
        action: 'read',
      },
    ]);
    expect(state.names).toEqual([KNOWLEDGE_DOCUMENTS_COLLECTION]);
    expect(state.policy).toBe(readPolicy);
    expect(documents).toEqual([repair, inspection]);
  });

  it('refuses to query at all when the read action is denied', async () => {
    const { database, state } = createRepository([repair]);
    const service = createKnowledgeService(database, unusedAuthorization);

    await expect(
      service.listDocuments(contextFor(decision('deny')).context),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(state.names).toEqual([]);
  });

  it('treats a denied grant branch as a denial rather than an unconstrained query', async () => {
    const { database, state } = createRepository([repair]);
    const service = createKnowledgeService(database, unusedAuthorization);
    // A composite decision may carry `false` for a collection no branch granted.
    const denied = {
      effect: 'permit',
      conditions: {
        database: { [KNOWLEDGE_DOCUMENTS_COLLECTION]: false },
      },
      reasons: [],
    } as unknown as AuthorizationDecision;

    await expect(
      service.listDocuments(contextFor(denied).context),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(state.policy).toBeUndefined();
  });

  it('returns undefined for a document the scoped query cannot find', async () => {
    const { database } = createRepository([repair]);
    const service = createKnowledgeService(database, unusedAuthorization);
    const { context } = contextFor(decision('permit', readPolicy));

    expect(await service.getDocument(context, 999)).toBeUndefined();
    expect(await service.getDocument(context, repair.id)).toEqual(repair);
  });
});

describe('KnowledgeService writes', () => {
  it('writes only the supplied fields plus the timestamp, never visibility', async () => {
    const { database, state } = createRepository([repair]);
    const service = createKnowledgeService(database, unusedAuthorization);
    const { context, calls } = contextFor(decision('permit', managePolicy));

    const updated = await service.updateDocument(context, repair.id, {
      title: '新标题',
    });

    expect(calls).toEqual([
      {
        resource: { type: 'composite', id: KNOWLEDGE_DOCUMENTS_RESOURCE },
        action: 'manage',
      },
    ]);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toEqual({
      title: '新标题',
      updatedAt: expect.any(Date),
    });
    expect(state.updates[0]).not.toHaveProperty('visibility');
    expect(updated).toMatchObject({ id: repair.id, title: '新标题' });
  });

  it('refuses to write when the manage action is denied', async () => {
    const { database, state } = createRepository([repair]);
    const service = createKnowledgeService(database, unusedAuthorization);

    await expect(
      service.updateDocument(contextFor(decision('deny')).context, repair.id, {
        body: '改写',
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(state.updates).toEqual([]);
  });

  it('returns undefined when the document is out of scope', async () => {
    // The supervisor's manage grant is checked, but the row is not visible to
    // this particular scoped query.
    const { database } = createRepository([repair]);
    const service = createKnowledgeService(database, unusedAuthorization);
    const { context } = contextFor(decision('permit', managePolicy));

    expect(
      await service.updateDocument(context, 999, { body: '改写' }),
    ).toBeUndefined();
  });
});

describe('KnowledgeService retrieval', () => {
  it('ranks only the rows the scoped query returned', async () => {
    // A colleague's scope holds the two public documents only.
    const { database } = createRepository([repair, inspection]);
    const service = createKnowledgeService(database, unusedAuthorization);
    const { context } = contextFor(decision('permit', readPolicy));

    expect(await service.searchDocuments(context, '墨竹 729')).toEqual([]);
    expect(
      (await service.searchDocuments(context, '报修电话')).map((row) => row.id),
    ).toEqual([repair.id]);
  });

  it('honours the result limit', async () => {
    const { database } = createRepository([repair, inspection, secret]);
    const service = createKnowledgeService(database, unusedAuthorization);
    const { context } = contextFor(decision('permit', readPolicy));

    const matches = await service.searchDocuments(context, '蓝鹭设备', 1);
    expect(matches).toHaveLength(1);
  });
});

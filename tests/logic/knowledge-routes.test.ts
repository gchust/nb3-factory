// @vitest-environment node
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { apiErrorHandler } from '@nocobase/app-server/router';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono, type Context, type Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it, vi } from 'vitest';

import type { KnowledgeDocument } from '../../server/knowledge-resources.js';
import {
  knowledgeServiceToken,
  type KnowledgeService,
} from '../../server/knowledge-service.js';
import { apiRoutes } from '../../server/routes/knowledge.js';

const SESSION_HEADER = 'x-test-user';

const publicDocument: KnowledgeDocument = {
  id: 1,
  title: '蓝鹭设备报修电话',
  body: '设备报修请拨打 400-000-7316。',
  visibility: 'public',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

const publicDto = {
  id: publicDocument.id,
  title: publicDocument.title,
  body: publicDocument.body,
  visibility: 'public',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

/** The authentication middleware as a test double: no header, no session. */
const fakeAuthentication = {
  required() {
    return async (context: Context, next: Next) => {
      const id = context.req.header(SESSION_HEADER);
      if (!id) {
        throw new HTTPException(401, { message: 'Unauthenticated.' });
      }
      context.set('auth', {
        user: { id },
        session: { id: `session-${id}` },
      } as never);
      await next();
    };
  },
};

/** Attaches an opaque hand; the decision itself lives in the service under test. */
const fakeAuthorization = {
  middleware() {
    return async (context: Context, next: Next) => {
      context.set('authz', {
        identity: { principal: { type: 'user', id: 'test' } },
      } as never);
      await next();
    };
  },
};

function fakeKnowledge(
  overrides: Partial<KnowledgeService> = {},
): KnowledgeService {
  const base = {
    contextForActor: vi.fn(async () => ({}) as never),
    listDocuments: vi.fn(async () => [publicDocument]),
    getDocument: vi.fn(async (_context: unknown, id: number) =>
      id === publicDocument.id ? publicDocument : undefined,
    ),
    updateDocument: vi.fn(
      async (
        _context: unknown,
        id: number,
        input: { title?: string; body?: string },
      ) =>
        id === publicDocument.id
          ? {
              ...publicDocument,
              ...input,
              updatedAt: new Date('2026-02-01T00:00:00.000Z'),
            }
          : undefined,
    ),
    searchDocuments: vi.fn(async () => []),
  };
  return Object.assign(base, overrides) as unknown as KnowledgeService;
}

async function createApp(knowledge: KnowledgeService) {
  const container = new ServiceContainer();
  container.instance(authenticationToken, fakeAuthentication as never);
  container.instance(authorizationToken, fakeAuthorization as never);
  container.instance(knowledgeServiceToken, knowledge);
  const router = await apiRoutes.createRouter({ container } as never);
  const app = new Hono();
  app.onError(apiErrorHandler);
  app.route('/', router);
  return app;
}

const session = { [SESSION_HEADER]: 'supervisor' };
const jsonHeaders = { ...session, 'content-type': 'application/json' };

describe('knowledge document routes', () => {
  it('answers an anonymous caller with 401', async () => {
    const app = await createApp(fakeKnowledge());
    const response = await app.request('/knowledge/documents');
    expect(response.status).toBe(401);
  });

  it('does not call the service before the caller is authenticated', async () => {
    const knowledge = fakeKnowledge();
    const app = await createApp(knowledge);
    await app.request('/knowledge/documents');
    expect(knowledge.listDocuments).not.toHaveBeenCalled();
  });

  it('lists the documents the caller may read, as ISO-timestamped DTOs', async () => {
    const app = await createApp(fakeKnowledge());
    const response = await app.request('/knowledge/documents', {
      headers: session,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [publicDto],
      meta: { total: 1 },
    });
  });

  it('answers 403 when the service refuses the read', async () => {
    const app = await createApp(
      fakeKnowledge({
        listDocuments: vi.fn(async () => {
          throw new AuthorizationDeniedError({
            effect: 'deny',
            reasons: [],
          } as never);
        }),
      }),
    );
    const response = await app.request('/knowledge/documents', {
      headers: session,
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { reason: string } };
    expect(body.error.reason).toBe('AUTHORIZATION_DENIED');
  });

  it('answers 404 for a document the caller cannot see, the same as a missing one', async () => {
    const app = await createApp(fakeKnowledge());
    const response = await app.request('/knowledge/documents/999', {
      headers: session,
    });

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { reason: string } };
    expect(body.error.reason).toBe('KNOWLEDGE_DOCUMENT_NOT_FOUND');
  });

  it('answers 404 rather than 403 when the read is permitted but the record is out of scope', async () => {
    const app = await createApp(
      fakeKnowledge({
        getDocument: vi.fn(async (_context: unknown, id: number) =>
          id === publicDocument.id ? publicDocument : undefined,
        ),
      }),
    );
    const response = await app.request('/knowledge/documents/999', {
      headers: session,
    });
    expect(response.status).toBe(404);
  });

  it('reads one document', async () => {
    const app = await createApp(fakeKnowledge());
    const response = await app.request(
      `/knowledge/documents/${publicDocument.id}`,
      {
        headers: session,
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: publicDto });
  });

  it('rejects an edit that changes nothing', async () => {
    const knowledge = fakeKnowledge();
    const app = await createApp(knowledge);
    const response = await app.request(
      `/knowledge/documents/${publicDocument.id}`,
      { method: 'PATCH', headers: jsonHeaders, body: '{}' },
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { reason: string } };
    expect(body.error.reason).toBe('KNOWLEDGE_EMPTY_UPDATE');
    expect(knowledge.updateDocument).not.toHaveBeenCalled();
  });

  it('rejects an edit whose field has the wrong type', async () => {
    const knowledge = fakeKnowledge();
    const app = await createApp(knowledge);
    const response = await app.request(
      `/knowledge/documents/${publicDocument.id}`,
      {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ title: 123 }),
      },
    );

    expect(response.status).toBe(400);
    expect(knowledge.updateDocument).not.toHaveBeenCalled();
  });

  it('updates the title and returns the new document', async () => {
    const app = await createApp(fakeKnowledge());
    const response = await app.request(
      `/knowledge/documents/${publicDocument.id}`,
      {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ title: '新标题' }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        ...publicDto,
        title: '新标题',
        updatedAt: '2026-02-01T00:00:00.000Z',
      },
    });
  });

  it('answers 403 when the edit is not permitted', async () => {
    const app = await createApp(
      fakeKnowledge({
        updateDocument: vi.fn(async () => {
          throw new AuthorizationDeniedError({
            effect: 'deny',
            reasons: [],
          } as never);
        }),
      }),
    );
    const response = await app.request(
      `/knowledge/documents/${publicDocument.id}`,
      {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ body: '改写' }),
      },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { reason: string } };
    expect(body.error.reason).toBe('AUTHORIZATION_DENIED');
  });

  it('answers 404 when the edit target is out of scope', async () => {
    const app = await createApp(fakeKnowledge());
    const response = await app.request('/knowledge/documents/999', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ body: '改写' }),
    });

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { reason: string } };
    expect(body.error.reason).toBe('KNOWLEDGE_DOCUMENT_NOT_FOUND');
  });
});

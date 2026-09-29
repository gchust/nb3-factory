import { describe, expect, it } from 'vitest';

import type { ApiClient } from '@nocobase/app-client';

import {
  deleteKnowledgeBaseDocument,
  fetchKnowledgeBase,
  fetchKnowledgeBaseDocuments,
  fetchManualKnowledgeBaseAccess,
  uploadKnowledgeBaseDocument,
  vectorizeKnowledgeBaseDocument,
} from '../../client/pages/service/manual-knowledge-base.js';

interface Call {
  readonly path: string;
  readonly method?: string;
  readonly query?: Record<string, unknown>;
  readonly body?: unknown;
}

function fakeClient(respond: (call: Call) => unknown) {
  const calls: Call[] = [];
  const client = {
    request: (options: Call) => {
      calls.push(options);
      return Promise.resolve(respond(options));
    },
  } as unknown as ApiClient;
  return { client, calls };
}

describe('device-manual knowledge base client', () => {
  it('reads the access signal the server returns', async () => {
    const { client, calls } = fakeClient(() => ({
      data: { knowledgeBaseKey: 'device-manuals', canManage: true },
    }));
    await expect(fetchManualKnowledgeBaseAccess(client)).resolves.toEqual({
      knowledgeBaseKey: 'device-manuals',
      canManage: true,
    });
    expect(calls[0].path).toBe('service/knowledge/manual-knowledge-base');
  });

  it('normalizes the plugin list envelope and keeps only the wanted base', async () => {
    const { client, calls } = fakeClient(() => ({
      data: {
        data: [
          { id: 1, key: 'other', name: 'Other' },
          {
            id: 2,
            key: 'device-manuals',
            name: 'Device manuals',
            knowledgeBaseType: 'LOCAL',
            enabled: true,
            documentCount: 2,
          },
        ],
        meta: { count: 2 },
      },
    }));
    await expect(
      fetchKnowledgeBase(client, 'device-manuals'),
    ).resolves.toMatchObject({
      id: 2,
      key: 'device-manuals',
      name: 'Device manuals',
      enabled: true,
      documentCount: 2,
    });
    expect(calls[0]).toMatchObject({
      path: 'ai/aiKnowledgeBase:list',
      query: { paginate: false, 'filter[key]': 'device-manuals' },
    });
  });

  it('maps document rows and their real status fields', async () => {
    const { client, calls } = fakeClient(() => ({
      data: {
        data: [
          {
            id: 'doc-1',
            knowledgeBaseKey: 'device-manuals',
            filename: 'aqua-pure-x200.md',
            indexStatus: 'ERROR',
            segmentCount: 4,
            errorMessage: 'Vector database is not available.',
          },
        ],
        meta: { count: 1 },
      },
    }));
    await expect(
      fetchKnowledgeBaseDocuments(client, 'device-manuals'),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'doc-1',
        filename: 'aqua-pure-x200.md',
        indexStatus: 'ERROR',
        segmentCount: 4,
        errorMessage: 'Vector database is not available.',
      }),
    ]);
    expect(calls[0]).toMatchObject({
      path: 'ai/aiKnowledgeBaseDocs:list',
      query: { paginate: false, 'filter[knowledgeBaseKey]': 'device-manuals' },
    });
  });

  it('uploads a document as multipart form data', async () => {
    const { client, calls } = fakeClient(() => ({ data: {} }));
    const file = new File(['# Manual'], 'manual.md', { type: 'text/markdown' });
    await uploadKnowledgeBaseDocument(client, 'device-manuals', file);
    expect(calls[0]).toMatchObject({
      path: 'ai/aiKnowledgeBaseDocs:upload',
      method: 'POST',
      query: { knowledgeBaseKey: 'device-manuals' },
    });
    const body = calls[0].body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('knowledgeBaseKey')).toBe('device-manuals');
    expect((body.get('file') as File).name).toBe('manual.md');
  });

  it('queues reprocessing and removal with the plugin query shape', async () => {
    const { client, calls } = fakeClient(() => ({ data: {} }));
    await vectorizeKnowledgeBaseDocument(client, 'device-manuals', 'doc-1');
    expect(calls[0]).toMatchObject({
      path: 'ai/aiKnowledgeBaseDocs:vectorization',
      method: 'POST',
      query: { knowledgeBaseKey: 'device-manuals', 'id[]': ['doc-1'] },
    });
    await deleteKnowledgeBaseDocument(client, 'doc-1');
    expect(calls[1]).toMatchObject({
      path: 'ai/aiKnowledgeBaseDocs:destroy',
      method: 'POST',
      query: { 'filterByTk[]': ['doc-1'] },
    });
  });
});

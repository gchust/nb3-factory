import { describe, expect, it } from 'vitest';

import {
  knowledgeBaseStatusOf,
  manualKnowledgeBaseFile,
} from '../../client/pages/service/manual-knowledge.ts';
import type { Manual } from '../../client/pages/service/model.ts';

function manual(overrides: Partial<Manual> = {}): Manual {
  return {
    id: '1',
    title: 'Manual',
    filename: null,
    content: '# body',
    status: 'pending',
    failureReason: null,
    knowledgeBaseKey: null,
    documentId: null,
    ...overrides,
  };
}

describe('manual knowledge base ingestion', () => {
  it('uploads each manual with a markdown filename the knowledge base accepts', () => {
    expect(manualKnowledgeBaseFile(manual({ filename: 'guide.md' })).name).toBe(
      'guide.md',
    );
    // The knowledge base matches the extension case-sensitively, so an
    // uppercase or missing extension must be normalized rather than rejected.
    expect(manualKnowledgeBaseFile(manual({ filename: 'guide.MD' })).name).toBe(
      'guide.md',
    );
    expect(manualKnowledgeBaseFile(manual({ filename: 'guide' })).name).toBe(
      'guide.md',
    );
    expect(manualKnowledgeBaseFile(manual({ id: '7' })).name).toBe('7.md');
  });

  it('reports a real failure reason instead of a pretend availability', () => {
    expect(
      knowledgeBaseStatusOf({
        indexStatus: 'ERROR',
        errorMessage: 'Vector database service-device-manuals-vector not found',
      }),
    ).toEqual({
      status: 'ERROR',
      errorMessage: 'Vector database service-device-manuals-vector not found',
    });
    expect(
      knowledgeBaseStatusOf({
        indexStatus: 'SUCCESS',
        segmentStatus: 'ERROR',
        segmentErrorMessage: 'segment failed',
      }),
    ).toEqual({ status: 'ERROR', errorMessage: 'segment failed' });
  });

  it('treats an upload that is still processing as pending, not available', () => {
    expect(knowledgeBaseStatusOf({ indexStatus: 'PENDING' })).toEqual({
      status: 'PENDING',
      errorMessage: null,
    });
    expect(knowledgeBaseStatusOf({})).toEqual({
      status: 'PENDING',
      errorMessage: null,
    });
  });

  it('reports success only after the platform processed the document', () => {
    expect(
      knowledgeBaseStatusOf({
        indexStatus: 'SUCCESS',
        segmentStatus: 'SUCCESS',
      }),
    ).toEqual({ status: 'SUCCESS', errorMessage: null });
  });
});

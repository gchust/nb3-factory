import { describe, expect, it } from 'vitest';

import type { KnowledgeDocument } from '../../server/knowledge-resources.js';
import { rankDocuments, searchTerms } from '../../server/knowledge-service.js';

/**
 * These are the three seeded documents, typed as the application stores them.
 * `secret` is the supervisor-only one; the colleague's retrieval never sees it
 * because the permission policy filters it out before this function runs, so
 * the tests model that by leaving it out of the input.
 */
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('searchTerms', () => {
  it('keeps an ASCII word whole and splits a CJK run into character bigrams', () => {
    expect(searchTerms('报修 phone 45 天')).toEqual([
      '报修',
      'phone',
      '45',
      '天',
    ]);
  });

  it('normalizes case and drops punctuation and symbols', () => {
    expect(searchTerms('400-000-7316？')).toEqual(['400', '000', '7316']);
    expect(searchTerms('  Blue   Heron  ')).toEqual(['blue', 'heron']);
  });

  it('returns nothing for text with no letters or digits', () => {
    expect(searchTerms('？？ ——')).toEqual([]);
  });
});

describe('rankDocuments', () => {
  it('matches a CJK question against the document that answers it', () => {
    const matches = rankDocuments([repair, inspection], '报修电话是多少');
    expect(matches.map((match) => match.id)).toEqual([repair.id]);
  });

  it('matches a numeric fact that appears at the end of a sentence', () => {
    const matches = rankDocuments([repair, inspection], '常规巡检间隔是多少天');
    expect(matches.map((match) => match.id)).toEqual([inspection.id]);
  });

  it('returns nothing when no document is a basis for the question', () => {
    expect(rankDocuments([repair, inspection], '火星殖民计划怎么申请')).toEqual(
      [],
    );
    expect(rankDocuments([repair, inspection], '')).toEqual([]);
  });

  it('cannot answer from a restricted document the caller may not read', () => {
    // The colleague's scope holds only the public documents: the secret document
    // is absent, so asking about it yields no material rather than a quote.
    expect(rankDocuments([repair, inspection], '墨竹 729')).toEqual([]);
    // The supervisor's scope includes it, so the same question is answerable.
    expect(rankDocuments([repair, inspection, secret], '墨竹 729')).toEqual([
      expect.objectContaining({ id: secret.id }),
    ]);
  });

  it('ranks a title match above a body-only match', () => {
    const titled = document(10, '巡检间隔', '与问题无关的正文。');
    const bodied = document(11, '其他说明', '巡检间隔为 45 天。');
    const matches = rankDocuments([bodied, titled], '巡检间隔');
    expect(matches.map((match) => match.id)).toEqual([titled.id, bodied.id]);
    expect(matches[0].score).toBeGreaterThan(matches[1].score);
  });

  it('is deterministic for a repeated question', () => {
    const first = rankDocuments([inspection, repair], '蓝鹭设备');
    const second = rankDocuments([inspection, repair], '蓝鹭设备');
    expect(second).toEqual(first);
  });

  it('keeps the whole document alongside its score', () => {
    const [match] = rankDocuments([repair], '报修电话');
    expect(match).toMatchObject({
      id: repair.id,
      title: repair.title,
      body: repair.body,
      visibility: repair.visibility,
    });
    expect(match.score).toBeGreaterThan(0);
  });
});

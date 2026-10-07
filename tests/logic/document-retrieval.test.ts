// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PER_DOCUMENT,
  retrieve,
  splitParagraphs,
  tokenize,
  type RetrievalDocument,
} from '../../server/providers/document-retrieval.ts';

const travelPolicy: RetrievalDocument = {
  id: '2',
  title: '差旅费报销管理办法',
  version: 2,
  content: [
    '# 差旅费报销管理办法',
    '',
    '## 出差申请',
    '',
    '员工出差前应填写出差申请单，经直属主管批准后方可出行。',
    '',
    '## 出差费用标准',
    '',
    '住宿费一线城市每人每晚不超过 500 元，其他城市不超过 350 元。',
    '',
    '## 报销流程',
    '',
    '出差结束后十个工作日内，员工应在报销系统中提交报销单，附上发票、行程单与出差申请单。',
  ].join('\n'),
};

const securityPolicy: RetrievalDocument = {
  id: '6',
  title: '信息安全管理制度',
  version: 1,
  content: [
    '# 信息安全管理制度',
    '',
    '## 账号与口令',
    '',
    '员工应当使用公司统一账号登录系统，口令长度不少于十二位并定期更换。',
  ].join('\n'),
};

describe('tokenize', () => {
  it('drops Chinese and English function words', () => {
    const tokens = tokenize('出差怎么报销 the reimbursement');
    expect(tokens).not.toContain('怎么');
    expect(tokens).not.toContain('the');
    expect(tokens).toContain('报销');
    expect(tokens).toContain('reimbursement');
  });

  it('keeps a meaningful single Chinese character as one token', () => {
    // A single-character run has no bigram to make, so it stays its own token.
    expect(tokenize('假')).toEqual(['假']);
    expect(tokenize('请假')).toEqual(['请假']);
  });

  it('drops a bigram that straddles a function character', () => {
    // `年假有几天` only contains the term `年假`; `假有`, `有几` and `几天` are
    // crossings, not terms, and must not be offered as matches.
    expect(tokenize('年假有几天')).toEqual(['年假']);
    expect(tokenize('年假多少天')).toEqual(['年假', '少天']);
    // A character that compounds are built on is not a boundary.
    expect(tokenize('请假')).toEqual(['请假']);
    expect(tokenize('要求')).toEqual(['要求']);
  });
});

describe('splitParagraphs', () => {
  it('carries the heading above a paragraph and ends a paragraph at a blank line', () => {
    const paragraphs = splitParagraphs(travelPolicy.content);
    const reimbursement = paragraphs.find((paragraph) =>
      paragraph.text.includes('报销系统'),
    );
    expect(reimbursement?.heading).toBe('报销流程');
    expect(paragraphs.every((paragraph) => paragraph.text.length > 0)).toBe(
      true,
    );
  });
});

describe('retrieve', () => {
  it('cites the paragraph that answers the question', () => {
    const result = retrieve('出差怎么报销', [travelPolicy]);
    expect(result.hasAnswer).toBe(true);
    expect(result.citations[0]?.documentId).toBe('2');
    expect(result.citations[0]?.heading).toBe('报销流程');
    expect(result.citations[0]?.version).toBe(2);
    expect(result.citations[0]?.snippet).toContain('报销系统');
  });

  it('says so explicitly when no paragraph supports an answer', () => {
    const result = retrieve('今天午饭吃什么', [travelPolicy, securityPolicy]);
    expect(result).toEqual({ hasAnswer: false, citations: [] });
  });

  it('does not cite a paragraph that shares only one common word', () => {
    // Each question overlaps a document on a single generic word — `公司`,
    // `申请`, `流程`, `计划` — but neither its subject nor its intent appears
    // anywhere, so the only honest answer is that there is no basis.
    for (const question of [
      '公司年会在哪里举办',
      '如何申请专利',
      '火星移民计划报名流程',
      '如何用香蕉发射火箭去火星',
    ]) {
      expect(retrieve(question, [travelPolicy, securityPolicy])).toEqual({
        hasAnswer: false,
        citations: [],
      });
    }
  });

  it('still answers a question whose subject is present', () => {
    const leavePolicy: RetrievalDocument = {
      id: '3',
      title: '请假与年假制度',
      version: 1,
      content: [
        '# 请假与年假制度',
        '',
        '## 年假',
        '',
        '员工累计工作满一年不满十年的，年假为十天；满十年的，年假为十五天。',
      ].join('\n'),
    };
    const result = retrieve('年假有几天', [leavePolicy]);
    expect(result.hasAnswer).toBe(true);
    expect(result.citations[0]?.heading).toBe('年假');
  });

  it('never cites a document it was not handed', () => {
    // The permission boundary is the caller's: retrieval only sees the
    // documents the asker may read. A question whose only answer lives in a
    // document left out returns nothing rather than leaking it.
    const result = retrieve('账号口令 十二位', [travelPolicy]);
    expect(result).toEqual({ hasAnswer: false, citations: [] });
    expect(retrieve('账号口令 十二位', [securityPolicy]).hasAnswer).toBe(true);
  });

  it('caps how many paragraphs one document contributes', () => {
    const result = retrieve('出差 报销 住宿费 申请', [travelPolicy]);
    const fromTravel = result.citations.filter(
      (citation) => citation.documentId === '2',
    );
    expect(fromTravel.length).toBeGreaterThan(0);
    expect(fromTravel.length).toBeLessThanOrEqual(DEFAULT_PER_DOCUMENT);
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { splitPresetComments } from '../preset-comment-inputs.mjs';

const marker = '<!-- factory:review-only -->';
const comment = (body, id = 1) => ({ id, author: 'human', body });

test('unmarked comments and /build retain original text and identity', () => {
  const source = [comment('业务需求'), comment('/build\n新增搜索', 2)];
  const result = splitPresetComments(source);
  assert.deepEqual(result, { business: source, reviews: [] });
  assert.equal(result.business[0], source[0]);
});

test('marked comments go only to reviews and retain provenance', () => {
  const review = { ...comment(`${marker}\n检查公共 API`, 4), url: 'source', createdAt: 'time' };
  assert.deepEqual(splitPresetComments([review]), {
    business: [], reviews: [{ ...review, body: '检查公共 API' }],
  });
  assert.equal(review.body, `${marker}\n检查公共 API`);
});

for (const prefix of ['', '\n\n', '\ufeff', '  ']) {
  test(`leading whitespace and CRLF work: ${JSON.stringify(prefix)}`, () => {
    const { business, reviews } = splitPresetComments([comment(`${prefix}${marker} \r\n核对 🔎\n源码`)]);
    assert.equal(business.length, 0);
    assert.equal(reviews[0].body, '核对 🔎\n源码');
  });
}

test('quoted, fenced, embedded and misspelled markers never change routing', () => {
  const source = [
    comment(`> ${marker}\n这是引用`),
    comment(`\x60\x60\x60html\n${marker}\n\x60\x60\x60`),
    comment(`说明\n${marker}\n正文`),
    comment('<!-- factory:review-onIy -->\n不是标记'),
    comment(`${marker} this is inline`),
  ];
  assert.deepEqual(splitPresetComments(source), { business: source, reviews: [] });
});

test('empty comments are ignored; marker-only cannot become business input', () => {
  const result = splitPresetComments([comment('  \n'), comment(marker, 2)]);
  assert.deepEqual(result, { business: [], reviews: [comment('', 2)] });
});

test('mixed comments retain independent source order without mutating snapshots', () => {
  const source = [comment('业务 A', 1), comment(`${marker}\n评审 A`, 2), comment('业务 B', 3), comment(`${marker}\n评审 B`, 4)];
  const before = JSON.stringify(source);
  const result = splitPresetComments(source);
  assert.deepEqual(result.business.map(c => c.id), [1, 3]);
  assert.deepEqual(result.reviews.map(c => c.id), [2, 4]);
  assert.equal(JSON.stringify(source), before);
});

test('a /build inside an explicit reviewer comment is not a business command', () => {
  const result = splitPresetComments([comment(`${marker}\n/build\nDo not inject`)]);
  assert.equal(result.business.length, 0);
  assert.equal(result.reviews[0].body, '/build\nDo not inject');
});

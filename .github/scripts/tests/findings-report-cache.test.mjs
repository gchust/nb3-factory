import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  FINDINGS_CACHE,
  cacheFile,
  getJson,
  gitBlobSha,
  readFindingsSnapshot,
} from '../report-pages.mjs';
import { collectOccurrences } from '../../reports/findings-index.mjs';
import { createClassificationInput } from '../../reports/findings-classification.mjs';

const root = path.resolve(import.meta.dirname, '../../reports');
const fixture = (name) =>
  JSON.parse(readFileSync(path.join(root, name), 'utf8'));

// A published report.json wraps the render facts in `delivery`.
function report(issue, title) {
  const facts = fixture('example.facts.json');
  facts.meta = {
    ...facts.meta,
    issue,
    runId: String(9000 + issue),
    attempt: 1,
    snapshotDate: `2026-09-${String((issue % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
  };
  facts.buildReview = fixture('example.framework-review.json');
  if (title) facts.buildReview.evaluation.findings[1].title = title;
  return { delivery: facts };
}
const dirOf = (issue) =>
  `reports/issues/${issue}/runs/${9000 + issue}/attempt-1/`;

// A gh-pages store serving the contents, commit, tree and blob APIs the
// snapshot uses, counting reads. Files above `limit` bytes answer the contents
// API with encoding "none", as GitHub does above 1 MiB.
function pagesStore({ limit = Infinity } = {}) {
  const files = new Map();
  const reads = { contents: 0, blobs: 0, trees: 0 };
  let truncated = false;
  const client = {
    repository: 'owner/factory',
    async getRef() {
      return { object: { sha: 'c'.repeat(40) } };
    },
    async request(method, route, { query } = {}) {
      assert.equal(method, 'GET', `${method} ${route}`);
      if (route.startsWith('/contents/')) {
        reads.contents += 1;
        const file = route.slice('/contents/'.length);
        if (!files.has(file)) return null;
        const content = files.get(file);
        if (Buffer.byteLength(content) > limit)
          return { sha: gitBlobSha(content), encoding: 'none', content: '' };
        return {
          sha: gitBlobSha(content),
          encoding: 'base64',
          content: Buffer.from(content).toString('base64'),
        };
      }
      if (route.startsWith('/git/commits/')) return { tree: { sha: 'root' } };
      if (route.startsWith('/git/trees/')) {
        reads.trees += 1;
        const tree = route.slice('/git/trees/'.length);
        if (tree === 'root')
          return { tree: [{ path: 'reports', type: 'tree', sha: 'reports' }] };
        if (tree === 'reports')
          return { tree: [{ path: 'issues', type: 'tree', sha: 'issues' }] };
        assert.equal(tree, 'issues');
        assert.equal(query?.recursive, '1');
        return {
          truncated,
          tree: [...files]
            .filter(([file]) => file.startsWith('reports/issues/'))
            .map(([file, content]) => ({
              path: file.slice('reports/issues/'.length),
              type: 'blob',
              sha: gitBlobSha(content),
            })),
        };
      }
      if (route.startsWith('/git/blobs/')) {
        reads.blobs += 1;
        const sha = route.slice('/git/blobs/'.length);
        const content = [...files.values()].find(
          (value) => gitBlobSha(value) === sha,
        );
        assert.ok(content, `unknown blob ${sha}`);
        return {
          encoding: 'base64',
          content: Buffer.from(content).toString('base64'),
        };
      }
      throw new Error(`Unexpected ${method} ${route}`);
    },
  };
  return {
    client,
    files,
    reads,
    truncate() {
      truncated = true;
    },
    reset() {
      Object.assign(reads, { contents: 0, blobs: 0, trees: 0 });
    },
  };
}

function publish(store, reports) {
  const issues = {};
  for (const [issue, value] of reports) {
    store.files.set(
      `${dirOf(issue)}report.json`,
      JSON.stringify(value, null, 2),
    );
    issues[issue] = {
      issue,
      start: issue,
      reportId: `owner/factory:${issue}`,
      path: `${dirOf(issue)}index.html`,
    };
  }
  store.files.set(
    'reports/manifest.json',
    JSON.stringify({ version: 1, issues }),
  );
}

const expectedInput = (reports) =>
  createClassificationInput(collectOccurrences(reports).occurrences);

test('the git blob SHA matches what Git assigns', () => {
  const content = '{"a":1}\n中文';
  assert.equal(
    gitBlobSha(content),
    execFileSync('git', ['hash-object', '--stdin'], {
      input: content,
      encoding: 'utf8',
    }).trim(),
  );
});

test('a file above the contents API limit is read through the blob API', async () => {
  const store = pagesStore({ limit: 10 });
  store.files.set(
    'reports/manifest.json',
    JSON.stringify({ version: 1, issues: {} }),
  );
  assert.deepEqual(
    await getJson(store.client, 'reports/manifest.json', 'gh-pages'),
    {
      version: 1,
      issues: {},
    },
  );
  assert.equal(store.reads.blobs, 1);
});

test('the findings snapshot reads only reports whose blob changed since the cache', async () => {
  const store = pagesStore();
  const reports = [
    [201, report(201)],
    [202, report(202, 'Scheduler 缺少立即执行入口')],
    [203, report(203)],
  ];
  publish(store, reports);
  const full = expectedInput(reports.map(([, value]) => value));

  const first = await readFindingsSnapshot(store.client);
  assert.deepEqual(first.input, full);
  assert.equal(store.reads.blobs, 3);
  assert.equal(store.reads.trees, 3);
  assert.equal(Object.keys(first.cache).length, 3);

  // A writer stores the cache; the next snapshot reads no report at all.
  const [file, content] = cacheFile(first.cache);
  assert.equal(file, FINDINGS_CACHE);
  store.files.set(file, content);
  store.reset();
  const second = await readFindingsSnapshot(store.client);
  assert.deepEqual(second.input, full);
  assert.equal(second.reports.length, 3);
  assert.equal(store.reads.blobs, 0);

  // One report changed: only that report is read again.
  reports[2] = [203, report(203, '另一个框架问题')];
  publish(store, reports);
  store.reset();
  const third = await readFindingsSnapshot(store.client);
  assert.deepEqual(
    third.input,
    expectedInput(reports.map(([, value]) => value)),
  );
  assert.equal(store.reads.blobs, 1);
});

test('a cache from another extractor version, or a damaged one, is ignored', async () => {
  const store = pagesStore();
  const reports = [[211, report(211)]];
  publish(store, reports);
  const snapshot = await readFindingsSnapshot(store.client);
  const stored = JSON.parse(cacheFile(snapshot.cache)[1]);
  for (const cache of [{ ...stored, extractor: 'other' }, 'not json']) {
    store.files.set(
      FINDINGS_CACHE,
      typeof cache === 'string' ? cache : JSON.stringify(cache),
    );
    store.reset();
    const again = await readFindingsSnapshot(store.client);
    assert.deepEqual(again.input, snapshot.input);
    assert.equal(store.reads.blobs, 1);
  }
});

test('a truncated tree listing falls back to reading each report', async () => {
  const store = pagesStore();
  const reports = [
    [221, report(221)],
    [222, report(222)],
  ];
  publish(store, reports);
  store.files.set(
    ...cacheFile((await readFindingsSnapshot(store.client)).cache),
  );
  store.truncate();
  store.reset();
  const snapshot = await readFindingsSnapshot(store.client);
  assert.deepEqual(
    snapshot.input,
    expectedInput(reports.map(([, value]) => value)),
  );
  assert.equal(store.reads.blobs, 0);
  // manifest, baseline, cache, two reports, classification
  assert.equal(store.reads.contents, 6);
  // The unverified cache entries are kept for the next writer, not dropped.
  assert.equal(Object.keys(snapshot.cache).length, 2);
});

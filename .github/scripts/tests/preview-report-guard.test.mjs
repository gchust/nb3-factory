import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const SCRIPT = path.resolve(import.meta.dirname, '..', 'deploy-preview.mjs');
const SHA = 'a'.repeat(40);
const RUN_URL = 'https://github.com/o/r/actions/runs/99';
const URL = 'https://nb3-12.nfvd.net/main/';

// What the first deploy of this run published, as `renderPreviewComment` leaves
// it: the address and the mark that says the address was verified.
const VERIFIED = [
  '<!-- factory-preview:99:1 -->',
  '<!-- factory-preview-verified -->',
  '## 预览环境',
  '',
  `**预览地址：${URL}**`,
  '',
].join('\n');

// The publish half of the workflow, driven against a recorded API. What it does
// to the pull request comment is the whole of its job, so that is what is read
// back: a second attempt at the same build is the case that misled a reviewer
// (PR #159, 2026-09-21).
function publish({ status, existing }) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'preview-report-'));
  try {
    const output = path.join(root, 'plan');
    mkdirSync(output, { recursive: true });
    writeFileSync(
      path.join(output, 'deploy.json'),
      JSON.stringify({
        repository: 'o/r',
        runId: 99,
        runUrl: RUN_URL,
        runAttempt: 1,
        prNumber: 12,
        headSha: SHA,
        url: URL,
      }),
    );
    writeFileSync(
      path.join(root, 'api.mjs'),
      `import { appendFileSync } from 'node:fs';
const comments = ${JSON.stringify(existing)};
const pull = ${JSON.stringify({
  body: `- [GitHub Actions 运行记录](${RUN_URL})`,
  head: { sha: SHA },
})};
globalThis.fetch = async (url, options = {}) => {
  const method = options.method ?? 'GET';
  const route = new URL(url).pathname.replace('/repos/o/r', '');
  appendFileSync(
    process.env.CALLS,
    JSON.stringify({ method, route, body: options.body ?? '' }) + '\\n',
  );
  const ok = (value) => ({ ok: true, status: 200, json: async () => value });
  if (route === '/pulls/12') return ok(pull);
  if (route.startsWith('/issues/')) return ok(comments);
  return { ok: false, status: 404, json: async () => ({}) };
};
`,
    );
    writeFileSync(path.join(root, 'calls'), '');
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        path.join(root, 'api.mjs'),
        SCRIPT,
        'publish',
        '--run-id',
        '99',
        '--output',
        output,
        '--status',
        status,
      ],
      {
        env: {
          ...process.env,
          CALLS: path.join(root, 'calls'),
          GITHUB_REPOSITORY: 'o/r',
          GITHUB_TOKEN: 'test-token',
          GITHUB_API_URL: 'https://api.example.com',
          GITHUB_RUN_ID: '555',
        },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr);
    return {
      writes: readFileSync(path.join(root, 'calls'), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .filter((call) => call.method === 'PATCH' || call.method === 'POST'),
      stderr: result.stderr,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const commentBody = (call) => JSON.parse(call.body).body;

test('a failing attempt does not withdraw an address that was verified', () => {
  const { writes, stderr } = publish({
    status: 'failed',
    existing: [
      { id: 777, body: VERIFIED, user: { login: 'github-actions[bot]' } },
    ],
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, 'PATCH');
  assert.equal(writes[0].route, '/issues/comments/777');
  const body = commentBody(writes[0]);
  assert.ok(body.includes(URL), 'the verified address stays published');
  assert.ok(body.includes('本次触发没有通过部署或公网检查'));
  assert.ok(!body.includes('暂无已确认可用的地址'));
  assert.match(stderr, /the published preview is unchanged/);
});

test('the first failure for a build is reported as a failure', () => {
  const { writes } = publish({ status: 'failed', existing: [] });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, 'POST');
  const body = commentBody(writes[0]);
  assert.ok(body.includes('暂无已确认可用的地址'));
  assert.ok(!body.includes(URL));
  assert.ok(!body.includes('<!-- factory-preview-verified -->'));
});

test('a verified report carries the address and the mark that says so', () => {
  const { writes } = publish({ status: 'success', existing: [] });
  assert.equal(writes.length, 1);
  const body = commentBody(writes[0]);
  assert.ok(body.includes('<!-- factory-preview-verified -->'));
  assert.ok(body.includes(URL));
  assert.ok(!body.includes('暂无已确认可用的地址'));
});

test('a verified report is republished over itself, not posted twice', () => {
  const { writes } = publish({
    status: 'success',
    existing: [
      { id: 777, body: VERIFIED, user: { login: 'github-actions[bot]' } },
    ],
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, 'PATCH');
  assert.equal(writes[0].route, '/issues/comments/777');
});

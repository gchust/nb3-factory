import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
const exec = promisify(execFile);

import {
  MARKER,
  formatBytes,
  packHistory,
  renderHistory,
  scrubSecrets,
  selectHistoryFiles,
} from '../agent-history.mjs';

const write = (root, relative, value = '') => {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, value);
};

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-history-'));
  const artifacts = path.join(root, 'artifacts');
  const output = path.join(root, 'out');
  mkdirSync(artifacts);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  write(artifacts, 'agent-implement.jsonl', '{"type":"turn_end"}\n');
  write(artifacts, 'agent-repair-1.jsonl', '{"type":"turn_end"}\n');
  write(
    artifacts,
    'verify-1.log',
    'FACTORY_TEST_PASSWORD=Factory-QA-346-3-29293-A9!\n',
  );
  write(
    artifacts,
    'verify-1/browser-acceptance/agent-browser-acceptance.jsonl',
    '{"type":"turn_end"}\n',
  );
  write(artifacts, 'verify-1/browser-acceptance/report.json', '{}\n');
  write(
    artifacts,
    'verify-1/browser-acceptance/evidence/page-assets.png',
    'png',
  );
  write(artifacts, 'unknown.txt', 'ignored');
  return { root, artifacts, output };
}

test('selects the agent-facing files and leaves media behind', (t) => {
  const f = fixture(t);
  symlinkSync(
    path.join(f.artifacts, 'agent-implement.jsonl'),
    path.join(f.artifacts, 'agent-linked.jsonl'),
  );
  const files = selectHistoryFiles(f.artifacts);
  assert.deepEqual(
    files.map((file) => file.name),
    [
      'agent-implement.jsonl',
      'agent-repair-1.jsonl',
      'verify-1.log',
      'verify-1/browser-acceptance/agent-browser-acceptance.jsonl',
      'verify-1/browser-acceptance/report.json',
    ],
  );
  assert.equal(
    files.find((file) => file.name === 'verify-1.log').phase,
    'verification',
  );
});

test('scrubs the credentials a console log can carry', () => {
  const scrubbed = scrubSecrets(
    'FACTORY_TEST_PASSWORD=Factory-QA-346-3-29293-A9!\nCODE_AGENT_API_KEY=sk-live-abcdef123456\npassword: "hunter2000"',
  );
  assert.doesNotMatch(scrubbed, /Factory-QA-346/u);
  assert.doesNotMatch(scrubbed, /sk-live-abcdef123456/u);
  assert.doesNotMatch(scrubbed, /hunter2000/u);
  assert.match(scrubbed, /\[REDACTED\]/u);
});

test('packs the history and keeps the original artifact untouched', (t) => {
  const f = fixture(t);
  const packed = packHistory({
    artifacts: f.artifacts,
    output: f.output,
    issue: 42,
    runId: 123,
    attempt: 1,
  });
  assert.equal(packed.manifest.issue, 42);
  assert.equal(packed.manifest.files.length, 5);
  assert.ok(packed.bytes > 0);
  assert.match(
    packed.archive,
    /agent-history-issue-42-run-123-attempt-1\.tar\.gz$/u,
  );
  const extracted = path.join(f.root, 'extracted');
  mkdirSync(extracted, { recursive: true });
  const tar = spawnSync('tar', ['-xzf', packed.archive, '-C', extracted], {
    encoding: 'utf8',
  });
  assert.equal(tar.status, 0, tar.stderr);
  const manifest = JSON.parse(
    readFileSync(path.join(extracted, 'manifest.json'), 'utf8'),
  );
  assert.equal(manifest.files.length, 5);
  assert.doesNotMatch(
    readFileSync(path.join(extracted, 'verify-1.log'), 'utf8'),
    /Factory-QA-346/u,
  );
  assert.match(
    readFileSync(path.join(extracted, 'verify-1.log'), 'utf8'),
    /\[REDACTED\]/u,
  );
  assert.ok(
    readFileSync(path.join(f.artifacts, 'verify-1.log'), 'utf8').includes(
      'Factory-QA-346',
    ),
    'the artifact keeps its own copy',
  );
});

test('reports nothing to publish when the run produced no transcripts', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-history-empty-'));
  const artifacts = path.join(root, 'artifacts');
  mkdirSync(artifacts);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(
    packHistory({
      artifacts,
      output: path.join(root, 'out'),
      issue: 1,
      runId: 1,
      attempt: 1,
    }),
    null,
  );
});

test('packing reports the archive through GITHUB_OUTPUT for the workflow', (t) => {
  const f = fixture(t);
  const manifest = path.join(f.root, 'manifest.json');
  const outputFile = path.join(f.root, 'gh-output');
  const result = spawnSync(
    process.execPath,
    [
      path.resolve(import.meta.dirname, '..', 'agent-history.mjs'),
      'pack',
      '--artifacts',
      f.artifacts,
      '--output',
      f.output,
      '--manifest',
      manifest,
      '--issue',
      '42',
      '--run',
      '123',
      '--attempt',
      '1',
    ],
    { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: outputFile } },
  );
  assert.equal(result.status, 0, result.stderr);
  const outputs = readFileSync(outputFile, 'utf8');
  assert.match(
    outputs,
    /^archive=.*agent-history-issue-42-run-123-attempt-1\.tar\.gz$/mu,
  );
  assert.match(
    outputs,
    /^asset=agent-history-issue-42-run-123-attempt-1\.tar\.gz$/mu,
  );
  assert.match(outputs, /^bytes=\d+$/mu);
});

test('the publishing workflow runs only trusted control code', () => {
  const workflow = readFileSync(
    path.resolve(
      import.meta.dirname,
      '..',
      '..',
      'workflows',
      'publish-agent-history.yml',
    ),
    'utf8',
  );
  assert.match(
    workflow,
    /workflow_run:\n\s+workflows: \[Code Agent NocoBase Task\]\n\s+types: \[completed\]/u,
  );
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /contents: write/u);
  assert.match(workflow, /issues: write/u);
  assert.match(workflow, /path: control/u);
  assert.match(workflow, /gh release upload factory-history/u);
  assert.match(workflow, /agent-history\.mjs publish/u);
  // Application code from the artifact must never be executed or installed.
  assert.doesNotMatch(workflow, /pnpm|npm install|pull_request\.head\.sha/u);
});

test('publishing posts once and then updates the same comment', async (t) => {
  const f = fixture(t);
  const packed = packHistory({
    artifacts: f.artifacts,
    output: f.output,
    issue: 42,
    runId: 123,
    attempt: 1,
  });
  const manifest = path.join(f.root, 'manifest.json');
  writeFileSync(manifest, JSON.stringify(packed));
  const calls = [];
  const comments = [];
  const server = http.createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const route = new URL(request.url, 'http://fixture').pathname;
    calls.push(`${request.method} ${route}`);
    response.setHeader('content-type', 'application/json');
    if (
      route === '/repos/owner/repo/issues/42/comments' &&
      request.method === 'GET'
    )
      return response.end(JSON.stringify(comments));
    if (
      route === '/repos/owner/repo/issues/42/comments' &&
      request.method === 'POST'
    ) {
      const body = JSON.parse(raw);
      comments.push({
        id: 7,
        body: body.body,
        user: { login: 'github-actions[bot]' },
      });
      return response.end(JSON.stringify(comments[0]));
    }
    if (
      route.startsWith('/repos/owner/repo/issues/comments/') &&
      request.method === 'PATCH'
    ) {
      comments[0].body = JSON.parse(raw).body;
      return response.end(JSON.stringify(comments[0]));
    }
    response.statusCode = 404;
    response.end('{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const env = {
    ...process.env,
    GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_TOKEN: 'fixture-token',
  };
  delete env.GITHUB_STEP_SUMMARY;
  const script = path.resolve(import.meta.dirname, '..', 'agent-history.mjs');
  const args = [
    'publish',
    '--manifest',
    manifest,
    '--issue',
    '42',
    '--run',
    '123',
    '--attempt',
    '1',
    '--asset-url',
    'https://example.test/a.tar.gz',
  ];
  const first = await exec(process.execPath, [script, ...args], { env });
  assert.match(first.stdout, /Agent history reported/u);
  assert.match(comments[0].body, /^<!-- factory-agent-history:123:1 -->/u);
  assert.match(comments[0].body, /（[0-9.]+ (?:B|KB|MB)，5 个文件）/u);
  assert.deepEqual(calls, [
    'GET /repos/owner/repo/issues/42/comments',
    'POST /repos/owner/repo/issues/42/comments',
  ]);
  const second = await exec(
    process.execPath,
    [script, ...args, '--status', '失败'],
    { env },
  );
  assert.match(second.stdout, /Agent history reported/u);
  assert.equal(comments.length, 1, 'a rerun updates its own comment');
  assert.equal(calls.at(-1), 'PATCH /repos/owner/repo/issues/comments/7');
  assert.match(comments[0].body, /失败/u);
  const third = await exec(
    process.execPath,
    [script, ...args, '--status', '失败'],
    {
      env,
    },
  );
  assert.match(third.stdout, /already reported/u);
  assert.equal(comments.length, 1);
});

test('renders a summary with the download link under its marker', () => {
  const body = renderHistory({
    issue: 42,
    runId: 123,
    attempt: 2,
    status: 'failure',
    bytes: 3_500_000,
    manifest: {
      files: [
        {
          name: 'agent-implement.jsonl',
          phase: 'implementation',
          bytes: 1_200_000,
        },
        { name: 'verify-1.log', phase: 'verification', bytes: 500_000 },
      ],
    },
    assetUrl:
      'https://github.com/gchust/nb3-factory/releases/download/factory-history/a.tar.gz',
    fallbackUrl: 'https://github.com/gchust/nb3-factory/actions/runs/123',
  });
  assert.ok(body.startsWith(MARKER(123, 2)));
  assert.match(body, /releases\/download\/factory-history\/a\.tar\.gz/u);
  // The archive size comes from the packed archive, not from a file inside it.
  assert.match(body, /（3\.3 MB，2 个文件）/u);
  assert.match(body, /初始实现 \| `agent-implement\.jsonl` \| 1\.1 MB/u);
  assert.match(body, /大小（未压缩）/u);
  assert.match(body, /· 失败/u);
  const fallback = renderHistory({
    issue: 42,
    runId: 123,
    attempt: 2,
    manifest: { bytes: 1, files: [] },
    assetUrl: '',
    fallbackUrl: 'https://github.com/gchust/nb3-factory/actions/runs/123',
  });
  assert.match(fallback, /记录未能上传/u);
  assert.equal(formatBytes(1_500), '1.5 KB');
});

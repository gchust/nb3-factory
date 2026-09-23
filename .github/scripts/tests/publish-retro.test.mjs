import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  LEDGER_MARKER,
  LEDGER_TITLE,
  MARKER,
  parseRetro,
  renderRetro,
  selectRetroArtifact,
} from '../publish-retro.mjs';

const exec = promisify(execFile);

const RETRO = {
  version: 1,
  summary: '迁移跑了两轮才过，主要卡在 Seed 的幂等写法上。',
  blockers: [
    {
      phase: 'verify',
      title: 'Seed 重复执行会插重',
      symptom: '第二次 migrate 后列表出现重复行',
      rootCause: 'Seed 直接 insert 没有 upsert',
      resolution: '改成按唯一键 upsert',
      cost: '多跑 1 轮修复 / 约 15 分钟',
    },
  ],
  improvements: [
    {
      category: 'skills-docs',
      title: 'Seed 文档要给出幂等模板',
      detail: '文档只说要写 Seed，没说必须可重复执行。',
      suggestedChange:
        'skills/nocobase-app-development/references/database-and-data.md 增加 upsert 示例',
      mechanizable: true,
    },
  ],
};

test('parses a retro, a fenced retro, and survives garbage', () => {
  const direct = parseRetro(JSON.stringify(RETRO));
  assert.equal(direct.structured, true);
  assert.equal(direct.data.blockers.length, 1);
  assert.equal(direct.data.improvements[0].category, 'skills-docs');

  const fenced = parseRetro(
    `好的：\n\n\`\`\`json\n${JSON.stringify(RETRO)}\n\`\`\`\n`,
  );
  assert.equal(fenced.structured, true);
  assert.equal(fenced.data.summary, RETRO.summary);

  const garbage = parseRetro('这次没写成 JSON，总之很卡。');
  assert.equal(garbage.structured, false);
  assert.match(garbage.raw, /很卡/u);

  assert.equal(parseRetro('').structured, false);
  assert.equal(parseRetro('').raw, null);
});

test('renders quantitative stats, blockers and baseline suggestions', () => {
  const body = renderRetro({
    issue: 42,
    runId: 123,
    attempt: 2,
    runUrl: 'https://example.test/run',
    targetBranch: 'apps/demo',
    conclusion: 'delivered',
    retro: parseRetro(JSON.stringify(RETRO)).data,
    structured: true,
    raw: null,
    repair: { verificationAttempts: 3, repairAttempts: 2 },
  });
  assert.match(body, /^<!-- factory-retro:123:2 -->/u);
  assert.match(body, /已生成\/更新业务 PR/u);
  assert.match(body, /\| 修复轮次 \| 2 \|/u);
  assert.match(body, /### 一、这次遇到了什么问题，怎么解决的/u);
  assert.match(body, /\*\*Seed 重复执行会插重\*\*（工厂验证）/u);
  assert.match(body, /### 二、如何优化 NocoBase 3 基线，避免下次再踩/u);
  assert.match(body, /\| Skill 文档缺失或误导 \|/u);
  assert.match(body, /\| 是 \|/u);
});

test('reports an unparsable retro instead of dropping it', () => {
  const body = renderRetro({
    issue: 42,
    runId: 123,
    attempt: 1,
    runUrl: 'https://example.test/run',
    targetBranch: 'apps/demo',
    conclusion: 'failure',
    retro: { summary: '', blockers: [], improvements: [] },
    structured: false,
    raw: '没写成 JSON',
    repair: null,
  });
  assert.match(body, /失败/u);
  assert.match(body, /原始复盘（JSON 解析失败，原文照录）/u);
  assert.doesNotMatch(body, /\| 验证轮次 \|/u);
});

test('selects the agent artifact for failed runs too', () => {
  const run = {
    path: '.github/workflows/code-agent-task.yml',
    head_repository: { full_name: 'owner/repo' },
    event: 'issues',
    status: 'completed',
    conclusion: 'failure',
  };
  const artifacts = [{ name: 'other' }, { name: 'factory-agent-42' }];
  assert.deepEqual(selectRetroArtifact(run, artifacts, 'owner/repo'), {
    artifact: { name: 'factory-agent-42' },
    issue: 42,
  });
  assert.equal(
    selectRetroArtifact(run, [{ name: 'other' }], 'owner/repo'),
    null,
  );
  assert.equal(
    selectRetroArtifact(
      { ...run, status: 'in_progress' },
      artifacts,
      'owner/repo',
    ),
    null,
  );
});

test('publishes an updatable retro comment and appends to the ledger', async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-retro-'));
  const artifacts = path.join(root, 'artifacts');
  mkdirSync(artifacts, { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, value) =>
    writeFileSync(path.join(root, name), JSON.stringify(value));
  writeFileSync(
    path.join(artifacts, 'task-metadata.json'),
    JSON.stringify({
      repository: 'owner/repo',
      issue: { number: 42 },
      workBranch: 'agent/issue-42',
      task: { targetBranch: 'apps/demo' },
    }),
  );
  writeFileSync(
    path.join(artifacts, 'repair-summary.json'),
    JSON.stringify({ verificationAttempts: 2, repairAttempts: 1 }),
  );
  writeFileSync(path.join(artifacts, 'retro.json'), JSON.stringify(RETRO));
  write('source.json', {
    repository: 'owner/repo',
    runId: 123,
    runUrl: 'https://example.test/run',
    runAttempt: 1,
    artifact: { name: 'factory-agent-42' },
    issue: 42,
    conclusion: 'delivered',
  });

  const calls = [];
  const comments = new Map();
  const created = [];
  let nextId = 7;
  const server = http.createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const url = new URL(request.url, 'http://fixture');
    const route = url.pathname;
    calls.push(`${request.method} ${route}`);
    response.setHeader('content-type', 'application/json');
    const list = (key) => [...(comments.get(key) ?? [])];
    if (/^\/repos\/owner\/repo\/issues\/\d+\/comments$/u.test(route)) {
      const issue = Number(route.split('/').at(-2));
      if (request.method === 'GET')
        return response.end(JSON.stringify(list(issue)));
      const body = JSON.parse(raw);
      const comment = {
        id: nextId++,
        body: body.body,
        user: { login: 'github-actions[bot]' },
      };
      comments.set(issue, [...list(issue), comment]);
      return response.end(JSON.stringify(comment));
    }
    if (route.startsWith('/repos/owner/repo/issues/comments/')) {
      const body = JSON.parse(raw);
      for (const entries of comments.values())
        for (const comment of entries)
          if (comment.id === Number(route.split('/').at(-1)))
            comment.body = body.body;
      return response.end('{}');
    }
    if (route === '/repos/owner/repo/issues' && request.method === 'GET')
      return response.end(JSON.stringify([]));
    if (route === '/repos/owner/repo/issues' && request.method === 'POST') {
      const issue = { number: 99, title: JSON.parse(raw).title };
      created.push(issue);
      return response.end(JSON.stringify(issue));
    }
    if (route.includes('/labels/')) return response.end(JSON.stringify({}));
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
  const script = path.resolve(import.meta.dirname, '..', 'publish-retro.mjs');
  const args = [
    'publish',
    '--run-id',
    '123',
    '--source',
    path.join(root, 'source.json'),
    '--artifacts',
    artifacts,
  ];

  const first = await exec(process.execPath, [script, ...args], { env });
  assert.match(first.stdout, /Retro reported to Issue #42/u);
  assert.match(first.stdout, /Ledger updated on Issue #99/u);
  assert.equal(created[0].title, LEDGER_TITLE);
  const issueComments = comments.get(42);
  assert.equal(issueComments.length, 1);
  assert.ok(issueComments[0].body.includes(MARKER(123, 1)));
  assert.match(issueComments[0].body, /Seed 重复执行会插重/u);
  const ledgerComments = comments.get(99);
  assert.equal(ledgerComments.length, 1);
  assert.ok(ledgerComments[0].body.includes(LEDGER_MARKER(123, 1)));
  assert.match(ledgerComments[0].body, /#issuecomment-7/u);

  const second = await exec(process.execPath, [script, ...args], { env });
  assert.match(second.stdout, /already reported/u);
  assert.equal(comments.get(42).length, 1, 'a rerun updates its own comment');
  assert.equal(comments.get(99).length, 1);
  // A changed run rewrites its own comment instead of adding a second one.
  write('source.json', {
    repository: 'owner/repo',
    runId: 123,
    runUrl: 'https://example.test/run',
    runAttempt: 1,
    artifact: { name: 'factory-agent-42' },
    issue: 42,
    conclusion: 'failure',
  });
  const third = await exec(process.execPath, [script, ...args], { env });
  assert.match(third.stdout, /Retro reported to Issue #42/u);
  assert.equal(comments.get(42).length, 1);
  assert.match(comments.get(42)[0].body, /失败/u);
  assert.ok(
    calls.some((call) =>
      call.startsWith('PATCH /repos/owner/repo/issues/comments/'),
    ),
  );
  assert.equal(
    comments.get(99).length,
    1,
    'the ledger keeps one entry per run',
  );
});

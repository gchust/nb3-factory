import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { STATUS_LABELS } from '../factory-lib.mjs';

const exec = promisify(execFile);
const repository = 'gchust/nb3-factory';
const issueBody =
  '### 目标分支\n\napps/demo\n\n### 任务类型\n\n创建新系统\n\n### 业务需求\n\nBuild a page\n\n### 验收要求\n\n1. Page works\n';
const issue = (number, label) => ({
  number,
  title: '[Pi] Test',
  body: issueBody,
  state: 'open',
  user: { login: 'gchust' },
  labels: [{ name: label }],
});
const pull = (number, ref) => ({
  number,
  head: { ref, repo: { full_name: repository } },
  base: { ref: 'apps/demo' },
  body: '<!-- pi-issue: 2 -->',
  merged: true,
});

async function runFixture(script, event, handler) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-task-migration-'));
  const requests = [];
  const server = http.createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const url = new URL(request.url, 'http://fixture');
    const call = {
      method: request.method,
      route: url.pathname.replace(`/repos/${repository}`, ''),
      query: url.searchParams,
      body: raw ? JSON.parse(raw) : undefined,
    };
    requests.push(call);
    const value = handler(call);
    response.writeHead(value === null ? 404 : 200, {
      'Content-Type': 'application/json',
    });
    response.end(JSON.stringify(value ?? { message: 'Not found' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const eventPath = path.join(root, 'event.json');
    const metadataPath = path.join(root, 'metadata.json');
    const outputPath = path.join(root, 'output');
    writeFileSync(
      eventPath,
      JSON.stringify({ repository: { owner: { login: 'gchust' } }, ...event }),
    );
    const args =
      script === 'prepare-task.mjs'
        ? [
            '--event',
            eventPath,
            '--metadata',
            metadataPath,
            '--output',
            outputPath,
          ]
        : [eventPath];
    await exec(
      process.execPath,
      [path.resolve(import.meta.dirname, '..', script), ...args],
      {
        env: {
          ...process.env,
          GITHUB_TOKEN: 'fixture-token',
          GITHUB_REPOSITORY: repository,
          GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
          GITHUB_EVENT_NAME:
            script === 'complete-pr.mjs' ? 'pull_request_target' : 'issues',
        },
        timeout: 15000,
      },
    );
    return {
      requests,
      ...(script === 'prepare-task.mjs'
        ? {
            metadata: JSON.parse(readFileSync(metadataPath, 'utf8')),
            output: readFileSync(outputPath, 'utf8'),
          }
        : {}),
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
}

function baseHandler(call) {
  if (call.route === '/labels')
    return Object.keys(STATUS_LABELS).map((name) => ({ name }));
  if (call.method !== 'GET') return { ...call.body };
  if (call.route === '/issues/2') return issue(2, 'pi:review');
  if (call.route === '') return { default_branch: 'develop' };
  if (call.route === '/git/ref/heads/apps/demo')
    return { object: { sha: 'base-sha' } };
  return null;
}

test('prepare reuses the existing legacy PR without creating a new branch', async () => {
  const result = await runFixture(
    'prepare-task.mjs',
    { issue: { number: 2 } },
    (call) => {
      if (call.route === '/pulls') return [pull(3, 'pi/issue-2')];
      if (call.route === '/git/ref/heads/pi/issue-2')
        return { object: { sha: 'existing-work-sha' } };
      return baseHandler(call);
    },
  );
  assert.equal(result.metadata.workBranch, 'pi/issue-2');
  assert.match(result.output, /base_sha=existing-work-sha/);
  assert.equal(result.metadata.existingPullRequest.number, 3);
  assert.equal(
    result.requests.filter((call) => call.route === '/git/refs').length,
    0,
  );
});

test('a legacy PR still blocks a newly named task on the same application branch', async () => {
  const result = await runFixture(
    'prepare-task.mjs',
    { issue: { number: 2 } },
    (call) => {
      if (call.route === '/pulls') return [pull(9, 'pi/issue-8')];
      return baseHandler(call);
    },
  );
  assert.equal(result.metadata.workBranch, 'agent/issue-2');
  assert.match(result.output, /status=waiting/);
  assert.ok(
    result.requests.some((call) =>
      call.body?.labels?.includes('agent:waiting'),
    ),
  );
});

for (const prefix of ['pi', 'agent']) {
  test(`completion of ${prefix} branch wakes the oldest task across both label generations`, async () => {
    const result = await runFixture(
      'complete-pr.mjs',
      { pull_request: pull(3, `${prefix}/issue-2`) },
      (call) => {
        if (call.route === '/issues' && call.method === 'GET') {
          return call.query.get('labels') === 'pi:waiting'
            ? [issue(4, 'pi:waiting')]
            : [issue(5, 'agent:waiting')];
        }
        return baseHandler(call);
      },
    );
    const dispatches = result.requests.filter(
      (call) => call.route === '/dispatches',
    );
    assert.equal(dispatches.length, 1);
    assert.deepEqual(dispatches[0].body, {
      event_type: 'code-agent-task',
      client_payload: { issue_number: 4 },
    });
    assert.ok(
      result.requests.some(
        (call) => call.route === '/issues/2' && call.body?.state === 'closed',
      ),
    );
    assert.ok(
      result.requests.some(
        (call) =>
          call.route === '/issues/4' &&
          call.body?.labels?.includes('agent:queued'),
      ),
    );
  });
}

test('old application-branch completion workflow cannot dispatch a duplicate task', async () => {
  const result = await exec(
    process.execPath,
    [path.resolve(import.meta.dirname, '..', 'complete-pr.mjs')],
    {
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_TOKEN: '',
      },
      timeout: 15000,
    },
  );
  assert.equal(result.stdout, '');
});

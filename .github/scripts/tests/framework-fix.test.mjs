import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  apiBase, buildPrompt, claimProblem, commitMessage, decide, openPullRequest, parseInputs,
  parseVerdict, pullRequestBody, redact, reportResult, resultPayload, workBranch,
} from '../framework-fix.mjs';

const RUN = '0f8b3c2e-5d1a-4c7b-9e2f-1a2b3c4d5e6f';
const SHA = 'a'.repeat(40);
const env = { EVALUATION_ENDPOINT: 'https://test3.example/main/api/evaluations/import', TESTMANAGE_TOKEN: 'key', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2' };
const snapshot = (id = 7) => ({
  version: 1, capturedAt: '2026-09-27T00:00:00.000Z', problemUrl: 'https://test3.example/main/test-progress/problems/7',
  problem: { id, title: 'Route guard ignores inherited authz', description: 'Steps\n```\nboom\n```', type: 'factory', status: 'pending', featurePointName: null, owner: null,
    factorySource: { reportId: 'r', taskTitle: 'CRM', reportUrl: 'https://gchust.github.io/nb3-factory/reports/x/index.html', issueUrl: 'https://github.com/gchust/nb3-factory/issues/1', pullRequestUrl: null, runUrl: 'https://github.com/gchust/nb3-factory/actions/runs/1', environmentUrl: null } },
  comments: [{ authorName: 'QA', content: 'Still happens on beta.47', createdAt: '2026-09-27T01:00:00.000Z' }],
});
const verdict = (overrides = {}) => ({
  version: 1, verdict: 'confirmed', fixed: true, summary: '确认存在并已修复', analysis: '根因在 packages/x.ts:10',
  verification: ['pnpm --filter @nocobase/x test: passed'],
  pullRequest: { title: 'fix(x): honor inherited authz', body: 'Problem, root cause, fix, verification.' },
  ...overrides,
});
const response = (status, body) => new Response(JSON.stringify(body), { status });

test('inputs accept a problem, an optional TestManage run and a plain base branch', () => {
  assert.deepEqual(parseInputs({ PROBLEM_ID: '42', EXTERNAL_RUN_ID: RUN.toUpperCase(), BASE_REF: '' }), { problemId: 42, externalRunId: RUN, baseRef: 'develop' });
  assert.deepEqual(parseInputs({ PROBLEM_ID: '1', EXTERNAL_RUN_ID: '', BASE_REF: 'release/3.0' }), { problemId: 1, externalRunId: null, baseRef: 'release/3.0' });
  for (const bad of [{ PROBLEM_ID: '0' }, { PROBLEM_ID: '1;rm' }, { PROBLEM_ID: '1', EXTERNAL_RUN_ID: 'x' }, { PROBLEM_ID: '1', BASE_REF: '../main' }, { PROBLEM_ID: '1', BASE_REF: 'a..b' }, { PROBLEM_ID: '1', BASE_REF: '-x' }]) {
    assert.throws(() => parseInputs(bad));
  }
  assert.equal(workBranch(42, RUN), 'fix/testmanage-problem-42-0f8b3c2e');
});

test('the TestManage API base follows the configured report endpoint and stays on HTTPS', () => {
  assert.equal(apiBase(env), 'https://test3.example/main/api');
  assert.equal(apiBase({ TESTMANAGE_API_BASE: 'https://other.example/api/' }), 'https://other.example/api');
  assert.equal(apiBase({ TESTMANAGE_API_BASE: 'http://127.0.0.1:13000/main/api' }), 'http://127.0.0.1:13000/main/api');
  assert.throws(() => apiBase({ TESTMANAGE_API_BASE: 'http://test3.example/api' }));
  assert.throws(() => apiBase({ TESTMANAGE_API_BASE: 'https://u:p@test3.example/api' }));
  assert.throws(() => apiBase({}));
});

test('claiming sends the Actions identity with the source key and validates the frozen snapshot', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? response(503, {}) : response(200, { data: { runId: RUN, snapshot: snapshot() } });
  };
  const claim = await claimProblem({ inputs: { problemId: 7, externalRunId: RUN }, env, fetchImpl, delayMs: 0 });
  assert.equal(claim.runId, RUN);
  assert.equal(calls.length, 2, 'an unavailable receiver is retried');
  assert.equal(calls[1].url, 'https://test3.example/main/api/problem-fixes/factory/claims');
  assert.equal(calls[1].options.headers['x-api-key'], 'key');
  assert.equal(calls[1].options.redirect, 'error');
  assert.deepEqual(JSON.parse(calls[1].options.body), { problemId: 7, externalRunId: RUN, workflowRunId: '123', workflowRunAttempt: 2 });
});

test('a definite claim rejection is final and a mismatched claim is refused', async () => {
  let calls = 0;
  await assert.rejects(claimProblem({ inputs: { problemId: 7, externalRunId: null }, env, delayMs: 0,
    fetchImpl: async () => { calls++; return response(409, { code: 'ACTIVE_RUN' }); } }), /409/);
  assert.equal(calls, 1);
  await assert.rejects(claimProblem({ inputs: { problemId: 7, externalRunId: RUN }, env, delayMs: 0,
    fetchImpl: async () => response(200, { data: { runId: '11111111-1111-4111-8111-111111111111', snapshot: snapshot() } }) }), /another fix run/);
  await assert.rejects(claimProblem({ inputs: { problemId: 7, externalRunId: null }, env, delayMs: 0,
    fetchImpl: async () => response(201, { data: { runId: RUN, snapshot: snapshot(8) } }) }), /another problem/);
});

test('the prompt fences problem text as data and names the only accepted verdict file', () => {
  const prompt = buildPrompt({ snapshot: snapshot(), runId: RUN, baseRef: 'develop', baseSha: SHA, verdictPath: '/tmp/out/verdict.json', dependencies: 'success' });
  assert.match(prompt, /\/tmp\/out\/verdict\.json/);
  assert.match(prompt, new RegExp(SHA));
  assert.match(prompt, /````text\nSteps\n```\nboom\n```\n````/, 'a longer fence keeps embedded backticks inside the block');
  assert.match(prompt, /Still happens on beta\.47/);
  assert.match(prompt, /不要\*\* commit、push/);
  assert.match(prompt, /gchust\.github\.io/);
  assert.match(buildPrompt({ snapshot: { ...snapshot(), commentsOmitted: 3 }, runId: RUN, baseRef: 'develop', baseSha: SHA, verdictPath: '/v', dependencies: 'success' }), /另有 3 条较早的评论/);
});

test('only a confirmed, declared fix with a real diff is published', () => {
  const ok = decide({ agentStatus: 0, verdict: { value: verdict() }, changedFiles: ['packages/x.ts'] });
  assert.equal(ok.publish, true);
  assert.equal(ok.pullRequest.title, 'fix(x): honor inherited authz');

  const noDiff = decide({ agentStatus: 0, verdict: { value: verdict() }, changedFiles: [] });
  assert.equal(noDiff.publish, false);
  assert.equal(noDiff.verdict, 'confirmed');
  assert.match(noDiff.analysis, /没有可提交的修改/);

  const undeclared = decide({ agentStatus: 0, verdict: { value: verdict({ verdict: 'not_reproducible', fixed: false, pullRequest: null }) }, changedFiles: ['a.ts'] });
  assert.equal(undeclared.publish, false);
  assert.match(undeclared.analysis, /已被丢弃/);
  assert.deepEqual(undeclared.changedFiles, []);

  assert.equal(decide({ agentStatus: 76, verdict: { value: verdict() }, changedFiles: ['a.ts'] }).verdict, 'error');
  assert.equal(decide({ agentStatus: 0, verdict: { error: '没有写入结论文件。' } }).verdict, 'error');
  assert.equal(decide({ agentStatus: 0, verdict: { value: verdict({ verdict: 'already_fixed' }) }, changedFiles: ['a.ts'] }).verdict, 'error');
});

test('verdicts are validated structurally rather than read from prose', () => {
  assert.throws(() => parseVerdict(verdict({ version: 2 })));
  assert.throws(() => parseVerdict(verdict({ verdict: 'maybe' })));
  assert.throws(() => parseVerdict(verdict({ pullRequest: null })));
  assert.throws(() => parseVerdict(verdict({ pullRequest: { title: 'a\nb', body: 'x' } })));
  assert.throws(() => parseVerdict(verdict({ fixed: false })), /pullRequest must be null/);
  assert.throws(() => parseVerdict(verdict({ summary: '' })));
  assert.deepEqual(parseVerdict(verdict({ fixed: false, verdict: 'needs_info', pullRequest: null, verification: undefined })).verification, []);
});

test('reported results are bounded, redacted and explain a failed publication', () => {
  const decision = decide({ agentStatus: 0, verdict: { value: verdict({ analysis: `token sk-ant-oat01-${'x'.repeat(30)} ${'长'.repeat(30000)}` }) }, changedFiles: ['a.ts'] });
  const payload = resultPayload({ decision, runId: '123', runUrl: 'https://github.com/gchust/nb3-factory/actions/runs/123', pullRequestUrl: '', branch: 'b', baseSha: SHA, publishFailed: true });
  assert.equal(payload.pullRequestUrl, null);
  assert.equal(payload.branch, null);
  // Heading, summary, analysis and links share TestManage's 20000-character comment.
  assert.ok(payload.summary.length + payload.analysis.length <= 19000);
  assert.doesNotMatch(payload.analysis, /sk-ant-oat01/);
  assert.match(payload.summary, /自动创建 PR 失败/);
  assert.throws(() => resultPayload({ decision, runId: '123', runUrl: 'u', pullRequestUrl: 'https://github.com/evil/repo/pull/1', branch: 'b', baseSha: SHA }));
  const published = resultPayload({ decision, runId: '123', runUrl: 'u', pullRequestUrl: 'https://github.com/nocobase/nocobase3/pull/9', branch: 'b', baseSha: SHA });
  assert.equal(published.branch, 'b');
  assert.match(published.analysis, /已执行的检查\*\*\n\n- pnpm --filter @nocobase\/x test: passed$/);
});

test('the result is posted once per run to the run-specific endpoint', async () => {
  let request;
  await reportResult({ env: { ...env, FIX_RUN_ID: RUN }, payload: { verdict: 'error' }, delayMs: 0,
    fetchImpl: async (url, options) => { request = { url, options }; return response(200, { data: {} }); } });
  assert.equal(request.url, `https://test3.example/main/api/problem-fixes/factory/runs/${RUN}/result`);
  await assert.rejects(reportResult({ env, payload: {} }), /FIX_RUN_ID/);
});

test('the PR is an attributed English draft that links its evidence', async () => {
  const decision = decide({ agentStatus: 0, verdict: { value: verdict() }, changedFiles: ['a.ts'] });
  const body = pullRequestBody({ decision, snapshot: snapshot(), runUrl: 'https://github.com/gchust/nb3-factory/actions/runs/123', baseSha: SHA });
  assert.match(body, /TestManage problem: #7/);
  assert.match(body, /Original factory report: https:\/\/gchust\.github\.io/);
  assert.match(body, /Generated with \[Claude Code\]/);
  assert.match(commitMessage({ decision, problemId: 7 }), /^fix\(x\): honor inherited authz\n\nRefs TestManage problem #7\.\n\nCo-Authored-By: Claude/);
  assert.equal(redact('ghp_' + 'a'.repeat(36)), '[REDACTED]');

  const requests = [];
  const url = await openPullRequest({ token: 't', branch: 'fix/b', base: 'develop', title: 'T', body: 'B',
    fetchImpl: async (u, o) => { requests.push({ u, o }); return requests.length === 1 ? response(422, { message: 'exists' }) : response(200, [{ html_url: 'https://github.com/nocobase/nocobase3/pull/5' }]); } });
  assert.equal(url, 'https://github.com/nocobase/nocobase3/pull/5');
  assert.deepEqual(JSON.parse(requests[0].o.body), { title: 'T', head: 'fix/b', base: 'develop', body: 'B', draft: true, maintainer_can_modify: true });
  assert.match(requests[1].u, /head=nocobase%3Afix%2Fb/);
});

test('the workflow keeps each credential in the one job that needs it', () => {
  const workflow = readFileSync(new URL('../../workflows/framework-fix.yml', import.meta.url), 'utf8');
  const job = (name) => workflow.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z-]+:\\n|$)`))[1];
  assert.match(workflow, /testmanage:problem-fix-v1/);
  assert.match(workflow, /external_run_id:\n\s+description:[^\n]+\n\s+required: false\n\s+type: string/);
  assert.match(workflow, /format\(' · request \{0\}', inputs.external_run_id\)/);
  assert.match(workflow, /^permissions: \{\}$/m);

  const claim = job('claim'), review = job('review'), publish = job('publish');
  assert.match(claim, /secrets\.EVALUATION_TOKEN/);
  assert.doesNotMatch(claim, /CLAUDE_CODE_OAUTH_TOKEN|NOCOBASE3_PR_TOKEN/);
  assert.match(review, /secrets\.CLAUDE_CODE_OAUTH_TOKEN/);
  assert.doesNotMatch(review, /EVALUATION_TOKEN|NOCOBASE3_PR_TOKEN|github\.token/);
  assert.match(review, /persist-credentials: false/);
  assert.match(publish, /secrets\.NOCOBASE3_PR_TOKEN/);
  assert.doesNotMatch(publish, /CLAUDE_CODE_OAUTH_TOKEN|run-agent|pnpm/, 'the publisher never runs Agent or repository code');
  assert.match(publish, /draft|open-pr/);
  // Dispatch inputs reach scripts through the environment, never shell source.
  for (const block of workflow.matchAll(/run: \|\n((?: {10,}.*\n?)+)/g)) assert.doesNotMatch(block[1], /\$\{\{\s*inputs\./);
  assert.doesNotMatch(workflow, /run: [^|\n]*\$\{\{\s*inputs\./);
});

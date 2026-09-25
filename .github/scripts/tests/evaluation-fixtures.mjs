// Shared, model-free fixtures for evaluation export/delivery tests. Artifact
// directories pass the real build-review identity and fingerprint checks.
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { reviewArtifactHash } from '../build-review.mjs';
import { coordinators, loadBatch } from '../evaluation-batch.mjs';
import { taskEvaluationIdentity } from '../evaluation-identity.mjs';
import { SAMPLE_LABEL } from '../evaluation-sample.mjs';
import { executionFacts } from '../evaluation-report.mjs';
import { aggregate, emptyUsage } from '../task-usage.mjs';

export const repository = 'owner/factory';
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=', 'base64');
const reports = path.resolve(import.meta.dirname, '../../reports');
export const example = name => JSON.parse(readFileSync(path.join(reports, name), 'utf8'));
export const digest = value => createHash('sha256').update(value).digest('hex');
export const control = 'c'.repeat(40);
export const base = 'b'.repeat(40);

export function temporary(t, prefix = 'evaluation-') {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
export function put(root, file, value) {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  return target;
}

// rounds: [{ round, scope: 'full'|'focused', statuses: ['passed','failed'] }]
export function buildArtifacts(root, {
  issue = 146, runId = 100, attempt = 1, rounds = [{ round: 1, scope: 'full', statuses: ['passed', 'passed'] }],
  repairs = 0, chainVerifications, chainRepairs, outcome = 'passed', review = 'completed', retro = false,
  identity = 'recorded', sample = null, buildCommentId = null, preset = true, baseline = true,
} = {}) {
  const metadata = {
    schemaVersion: 1, repository, owner: 'owner', defaultBranch: 'develop',
    issue: { number: issue, title: '客户资料管理', url: `https://github.com/${repository}/issues/${issue}`, author: 'owner' },
    task: { targetBranch: 'develop', taskType: '创建新系统', requirements: '客户资料', acceptanceCriteria: 'B01. 创建客户\nB02. 编辑客户',
      sampleData: '是', buildReviewMode: 'full', reviewCriteria: '## 评审\n核对数据访问' },
    workBranch: `agent/issue-${issue}`, targetCreated: false, existingPullRequest: null,
    controlSha: control, run: { id: runId, attempt }, applicationBase: { ref: 'develop', sha: base },
    ...(buildCommentId ? { buildCommentId } : {}),
    ...(preset ? { preset: { sourceIssueNumber: 155, sourceIssueUrl: `https://github.com/${repository}/issues/155`,
      capturedAt: '2026-09-24T10:00:00.000Z', inputHash: 'd'.repeat(64), humanCommentCount: 1, reviewHash: 'e'.repeat(64), reviewCommentCount: 1 } } : {}),
  };
  if (identity === 'recorded') {
    metadata.evaluation = taskEvaluationIdentity({ repository, issueNumber: issue, buildCommentId, sample });
    metadata.entrySha = control;
  }
  put(root, 'task-metadata.json', metadata);
  const patch = `diff --git a/server/customers.ts b/server/customers.ts\n+export const customers = [];\n`;
  put(root, 'agent.patch', patch);
  const last = rounds.at(-1)?.round ?? 0;
  put(root, 'pipeline-state.json', { version: 1, inputHash: 'f'.repeat(64), controlSha: control, phase: outcome === 'passed' ? 'done' : 'repair',
    verificationAttempts: chainVerifications ?? last, repairAttempts: chainRepairs ?? repairs, pendingCriteria: [], failureKind: 'browser',
    fullQaSeconds: 10, outcome, patchHash: digest(patch) });
  put(root, 'repair-summary.json', { verificationAttempts: rounds.length, repairAttempts: repairs, finalVerificationAttempt: last });
  for (const { round, scope, statuses } of rounds) {
    const dir = `verify-${round}/browser-${scope === 'full' ? 'acceptance' : 'focused'}`;
    put(root, `verify-${round}.log`, `verification ${round}\n`);
    put(root, `${dir}/report.json`, { passed: statuses.every(s => s === 'passed'), authenticated: true, summary: `第 ${round} 轮`,
      checks: statuses.map((status, index) => ({ id: `B0${index + 1}`, criterion: index ? '编辑客户' : '创建客户', status,
        actions: ['打开页面'], evidence: ['观察结果'], screenshots: [`b0${index + 1}.png`] })), failures: [] });
    statuses.forEach((_, index) => put(root, `${dir}/evidence/b0${index + 1}.png`, png));
  }
  if (retro) put(root, 'retro.json', { version: 1, summary: '过程总结', blockers: [{ phase: 'repair', title: '表单回填缺失', symptom: '原值为空',
    rootCause: '未初始化', resolution: '补充初始化', status: 'resolved' }], improvements: [{ category: 'skills-docs', title: '补充示例',
    detail: '避免重复定位', suggestedChange: '补充表单回填示例', mechanizable: true }] });
  if (baseline) put(root, 'baseline.json', { version: 1, kind: 'installed-packages', controlSha: control, workspaceSha: base, source: null,
    creatorVersion: '0.1.0-beta.20', templateVersion: '1.0.0-beta.45', lockSha256: '1'.repeat(64),
    packages: [{ name: '@nocobase/example-data', version: '0.0.0-fixture' }, { name: '@nocobase/example-router', version: '0.0.0-fixture' }],
    files: [{ path: 'AGENTS.md', sha256: '2'.repeat(64) }, { path: '.agents/skills/example-data/SKILL.md', sha256: '3'.repeat(64) }],
    omissions: [], fingerprint: '4'.repeat(64) });
  put(root, 'agent-implement.jsonl.invocation.json', { version: 1, id: 'x', engine: 'pi', phase: 'implementation', status: 'finished',
    invoked: true, controlSha: control, promptSha256: '5'.repeat(64), model: 'fixture-model', actualVersion: '0.86.1', context: [] });
  if (review !== 'none') writeReview(root, review, { runId, attempt, issue });
  return metadata;
}

export function reviewBasis(root, { issue = 146, runId = 100, attempt = 1, rubric = 2 } = {}) {
  const metadata = JSON.parse(readFileSync(path.join(root, 'task-metadata.json'), 'utf8'));
  return { repository, issue, runId: String(runId), attempt, controlSha: control, rubricVersion: rubric, baseSha: base,
    patchHash: digest(readFileSync(path.join(root, 'agent.patch'))), lockfileHash: '1'.repeat(64),
    packages: [{ name: '@nocobase/example-data', version: '0.0.0-fixture' }, { name: '@nocobase/example-router', version: '0.0.0-fixture' }],
    reviewCriteriaHash: digest(metadata.task.reviewCriteria ?? ''), artifactHash: reviewArtifactHash(root), inputHash: 'a'.repeat(64) };
}

export function writeReview(root, state, identity = {}, file = 'build-review.json', reviewer = null) {
  const basis = reviewBasis(root, { ...identity, rubric: state === 'v1' ? 1 : 2 });
  let report;
  if (state === 'failed' || state === 'not-reviewed') {
    report = { version: 1, state, reason: state === 'failed' ? '评审模型超时' : '本轮明确关闭独立评审', basis, evaluation: null,
      execution: { buildReviewMode: state === 'failed' ? 'full' : 'off', source: 'task' } };
  } else {
    report = example(state === 'v1' ? 'example.review.json' : 'example.framework-review.json');
    report.basis = basis;
    report.execution = { buildReviewMode: 'full', source: 'task' };
    if (state === 'partial') { report.state = 'partial'; report.evaluation.progress = { complete: false, pendingModules: ['页面路由与接入指引'] }; }
  }
  report.reviewer = reviewer ?? { engine: 'pi', model: 'fixture-model', version: '0.86.1', runId: String(basis.runId), attempt: basis.attempt, controlSha: control, replay: false };
  put(root, file, report);
  return report;
}

export function usageRecord({ issue = 146, runId = 100, attempt = 1, status = 'delivered', start = 1_790_000_000_000, seconds = 60,
  agentJobId = runId * 10 + attempt, records = 3, event = 'issues', previousRunId = null, facts = null } = {}) {
  const usage = emptyUsage();
  usage.records = records;
  usage.phases.implementation = { input: 100 * records, output: 10 * records, cacheRead: 50, cacheWrite: 0, reasoning: 0, totalTokens: 110 * records + 50 };
  return { version: 1, repository, issue, runId, attempt, status, start, end: start + seconds * 1000,
    jobs: [{ id: agentJobId, name: 'agent', seconds }], agentJobId, invoked: true, artifact: `factory-agent-${issue}`, artifactId: 9,
    event, previousRunId, usage, ...(facts ? { evaluation: facts } : {}) };
}

// A report.json as written by report-task-usage publish, with executionFacts on the current record.
export function reportFor(root, record, prior = [], pr = null) {
  const metadata = JSON.parse(readFileSync(path.join(root, 'task-metadata.json'), 'utf8'));
  const current = { ...record, evaluation: executionFacts(metadata, root, record) };
  const records = [...prior, current];
  return { record: current, records, cumulative: aggregate(records), timings: [], pr };
}

// In-memory GitHub API: gh-pages Git objects (non-forced ref updates), Actions
// artifacts and Issues. Injected conflicts exercise the registry's CAS retries.
export function fakeGitHub({ repository: repo = repository } = {}) {
  const blobs = new Map(), trees = new Map(), commits = new Map(), artifacts = new Map(), runs = new Map();
  let ref = null, conflicts = 0, sequence = 0;
  const hash = value => createHash('sha1').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
  const client = {
    repository: repo, token: 'test-token', apiUrl: 'https://api.github.invalid', calls: [],
    injectConflicts(n) { conflicts = n; },
    async getRef() { return ref ? { object: { sha: ref } } : null; },
    async createRef(_branch, sha) { if (ref) throw new Error('GitHub API failed (422): exists'); ref = sha; },
    async request(method, route, { body, query } = {}) {
      client.calls.push(`${method} ${route}`);
      if (method === 'GET' && route.startsWith('/git/commits/')) return commits.get(route.split('/').at(-1));
      if (method === 'GET' && route.startsWith('/git/blobs/')) {
        const data = blobs.get(route.split('/').at(-1));
        return data ? { encoding: 'base64', content: data.toString('base64') } : null;
      }
      if (method === 'GET' && route.startsWith('/contents/')) {
        const at = query?.ref === 'gh-pages' ? ref : query?.ref;
        const tree = commits.get(at) && trees.get(commits.get(at).tree.sha);
        const sha = tree?.get(route.slice('/contents/'.length));
        if (!sha) return null;
        const data = blobs.get(sha);
        // Mirror the real API: no inline content above 1 MiB.
        return data.length > 1024 * 1024 ? { type: 'file', sha, encoding: 'none', content: '' } : { type: 'file', sha, encoding: 'base64', content: data.toString('base64') };
      }
      if (method === 'POST' && route === '/git/blobs') {
        const data = Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8');
        const sha = createHash('sha1').update(data).digest('hex');
        blobs.set(sha, data); return { sha };
      }
      if (method === 'POST' && route === '/git/trees') {
        const tree = new Map(trees.get(body.base_tree));
        for (const entry of body.tree) tree.set(entry.path, entry.sha);
        const sha = hash([...tree].sort()); trees.set(sha, tree); return { sha };
      }
      if (method === 'POST' && route === '/git/commits') {
        const sha = hash({ ...body, n: sequence++ }); commits.set(sha, { tree: { sha: body.tree }, parents: body.parents }); return { sha };
      }
      if (method === 'PATCH' && route === '/git/refs/heads/gh-pages') {
        if (body.force !== false) throw new Error('forced update');
        if (conflicts > 0) { conflicts--; throw new Error('GitHub API PATCH failed (422): not a fast forward'); }
        if (!commits.get(body.sha)?.parents.includes(ref)) throw new Error('GitHub API PATCH failed (422): not a fast forward');
        ref = body.sha; return {};
      }
      const artifact = /^\/actions\/artifacts\/(\d+)$/.exec(route);
      if (method === 'GET' && artifact) return artifacts.get(Number(artifact[1])) ?? null;
      const listed = /^\/actions\/runs\/(\d+)\/artifacts$/.exec(route);
      if (method === 'GET' && listed) return { artifacts: [...artifacts.values()].filter(a => a.workflow_run.id === Number(listed[1]) && (!query?.name || a.name === query.name)) };
      const run = /^\/actions\/runs\/(\d+)$/.exec(route);
      if (method === 'GET' && run) return runs.get(Number(run[1])) ?? null;
      throw new Error(`Unexpected ${method} ${route}`);
    },
    // A committed file as bytes, for assertions.
    file(file) { const tree = ref && trees.get(commits.get(ref).tree.sha); const sha = tree?.get(file); return sha ? blobs.get(sha) : null; },
    files() { const tree = ref && trees.get(commits.get(ref).tree.sha); return tree ? [...tree.keys()].sort() : []; },
    ref: () => ref,
    // Upload an artifact whose archive contains the given files, like upload-artifact does.
    addArtifact({ id, name, runId, files, expired = false }) {
      artifacts.set(id, { id, name, expired, workflow_run: { id: runId }, zip: files });
    },
    artifactZip(id) { return artifacts.get(id)?.zip; },
  };
  return client;
}

// Test-only Evaluation Import v1 receiver. It is a protocol acceptance fixture,
// not a stand-in for Test Manager. faults: queue of per-request behaviours.
export async function startReceiver(t, { faults = [], token = 'receiver-token', authMode = 'x-api-key' } = {}) {
  const { createServer } = await import('node:http');
  const { verifyBundle } = await import('../evaluation-bundle.mjs');
  const stored = new Map();
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const fault = faults.shift() ?? null;
    requests.push({ headers: request.headers, url: request.url, fault, bytes: body.length });
    const reply = (status, value, headers = {}) => { response.writeHead(status, { 'content-type': 'application/json', ...headers }); response.end(typeof value === 'string' ? value : JSON.stringify(value)); };
    if (fault?.status) return reply(fault.status, fault.body ?? { error: 'injected' }, fault.headers);
    if (fault === 'hang') return; // Client timeout.
    const presented = authMode === 'bearer' ? request.headers.authorization : request.headers['x-api-key'];
    if (presented !== (authMode === 'bearer' ? `Bearer ${token}` : token)) return reply(401, { error: 'unauthorized' });
    const boundary = /boundary=([^;]+)/.exec(request.headers['content-type'] ?? '')?.[1];
    const start = body.indexOf('\r\n\r\n') + 4, end = body.lastIndexOf(Buffer.from(`\r\n--${boundary}--`));
    if (!boundary || start < 4 || end < start || !body.includes('name="bundle"')) return reply(400, { error: 'bundle field required' });
    const zip = body.subarray(start, end);
    const bundleSha256 = digest(zip);
    if (bundleSha256 !== request.headers['x-evaluation-bundle-sha256'] || request.headers['x-evaluation-schema-version'] !== '1') return reply(422, { error: 'digest' });
    let evaluation;
    try { ({ evaluation } = verifyBundle(zip)); } catch (error) { return reply(422, { error: error.message }); }
    const key = request.headers['idempotency-key'];
    const previous = stored.get(key);
    if (previous && previous.bundleSha256 !== bundleSha256) return reply(409, { error: 'conflict' });
    const subject = evaluation.type === 'evaluation-batch' ? { batchKey: evaluation.batch.subjectKey } : { runKey: evaluation.run.key };
    const receipt = previous?.receipt ?? { receiptId: `rcpt-${stored.size + 1}`, sourceInstance: evaluation.source.instance, ...subject,
      revision: evaluation.revision, bundleSha256, state: 'stored' };
    if (!previous) stored.set(key, { bundleSha256, receipt, evaluation });
    if (fault === 'drop-after-store') { request.socket.destroy(); return; }
    // Stored, headers sent, then the receipt body is cut off or never finished.
    if (fault === 'partial-drop' || fault === 'partial-hang') {
      response.writeHead(201, { 'content-type': 'application/json' });
      response.write(JSON.stringify(receipt).slice(0, 12));
      if (fault === 'partial-drop') setTimeout(() => request.socket.destroy(), 20);
      return;
    }
    if (fault === 'wrong-receipt') return reply(201, { ...receipt, revision: receipt.revision + 1 });
    if (fault === 'not-json') { response.writeHead(201); response.end('<html>ok</html>'); return; }
    reply(previous ? 200 : 201, receipt);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { url: `http://127.0.0.1:${server.address().port}/api/evaluations/import`, stored, requests, token };
}

const bot = { login: 'github-actions[bot]', type: 'Bot' };
export const human = { login: 'owner', type: 'User' };
export const lock = Buffer.from('lockfileVersion: 9.0\n');
export const presetBody = ['### 目标分支', '', 'issues-176', '', '### 任务类型', '', '创建新系统', '', '### 业务需求', '', '做一个计数器',
  '', '### 验收要求', '', 'B01. 点击加一', '', '### 框架评测', '', '轻量'].join('\n');
export const names = issue => issue.labels.map(label => label.name ?? label);

// Open coordinators with a complete manifest and state, in creation order.
export async function openBatches(client) {
  const batches = [];
  for (const issue of await coordinators(client, 'open')) {
    const batch = await loadBatch(client, issue);
    if (batch.manifest && batch.state) batches.push(batch);
  }
  return batches;
}

// A GitHub repository in memory: Issues, comments, labels, workflow runs/jobs,
// contents at the frozen commit, and the gh-pages evaluation registry.
export function fakeRepository() {
  const pages = fakeGitHub();
  const state = { issues: new Map(), comments: new Map(), labels: new Set(), runs: [], jobs: new Map(), dispatches: [], next: 500, commentId: 1, fail: null, compare: 'identical' };
  state.issues.set(176, { number: 176, title: '[预置][F00] 流程冒烟：单页计数器', body: presetBody, state: 'closed', user: human,
    labels: [{ name: 'factory:preset' }], html_url: `https://github.com/${repository}/issues/176`, updated_at: '2026-09-20T00:00:00Z' });
  state.comments.set(176, [{ id: 90, user: human, body: '补充：计数器从 0 开始', created_at: '2026-09-20T01:00:00Z', html_url: 'x' }]);
  const page = (list, query) => { const offset = ((query?.page ?? 1) - 1) * 100; return structuredClone(list.slice(offset, offset + 100)); };
  const client = {
    repository, token: 't', apiUrl: 'https://api.github.invalid', state, pages,
    async getRepository() { return { default_branch: 'develop' }; },
    async getRef(branch) { return branch === 'gh-pages' ? pages.getRef() : { object: { sha: control } }; },
    createRef: (...args) => pages.createRef(...args),
    async getIssue(number) { return client.request('GET', `/issues/${number}`); },
    async addComment(number, body) { return client.request('POST', `/issues/${number}/comments`, { body: { body } }); },
    async ensureStatusLabels() {},
    async request(method, route, options = {}) {
      const { body, query } = options;
      if (state.fail?.(method, route, body)) { state.fail = null; throw new Error(`Injected failure: ${method} ${route}`); }
      if (route.startsWith('/git/') || route.startsWith('/actions/artifacts') || route.startsWith('/contents/evaluations/') || (route.startsWith('/contents/') && query?.ref === 'gh-pages'))
        return pages.request(method, route, options);
      if (method === 'GET' && route === '') return client.getRepository();
      if (method === 'GET' && route.startsWith('/contents/')) {
        if (query?.ref !== control) return null;
        if (route === '/contents/pnpm-lock.yaml') return { encoding: 'base64', content: lock.toString('base64'), sha: 'l' };
        if (route === '/contents/factory-template.json') return { encoding: 'base64', content: Buffer.from('{"templateVersion":"1.0.0-beta.45"}').toString('base64') };
        return null;
      }
      if (method === 'GET' && route.startsWith('/compare/')) return { status: state.compare };
      if (route.startsWith('/labels/') && method === 'GET') return state.labels.has(decodeURIComponent(route.slice(8))) ? {} : null;
      if (route === '/labels' && method === 'POST') { state.labels.add(body.name); return body; }
      if (route === '/issues' && method === 'GET') {
        const wanted = (query.labels ?? '').split(',').filter(Boolean);
        return page([...state.issues.values()].filter(issue => wanted.every(label => names(issue).includes(label)) &&
          (query.state === 'all' || issue.state === query.state)), query);
      }
      if (route === '/issues' && method === 'POST') {
        const issue = { number: state.next++, title: body.title, body: body.body, labels: body.labels.map(name => ({ name })), state: 'open', user: bot };
        state.issues.set(issue.number, issue); return structuredClone(issue);
      }
      let match = /^\/issues\/(\d+)$/.exec(route);
      if (match) {
        const issue = state.issues.get(Number(match[1]));
        if (method === 'PATCH') Object.assign(issue, body);
        return structuredClone(issue);
      }
      match = /^\/issues\/(\d+)\/comments$/.exec(route);
      if (match) {
        const list = state.comments.get(Number(match[1])) ?? [];
        if (method === 'GET') return page(list, query);
        const comment = { id: state.commentId++, user: bot, body: body.body, created_at: new Date().toISOString() };
        list.push(comment); state.comments.set(Number(match[1]), list); return structuredClone(comment);
      }
      match = /^\/issues\/comments\/(\d+)$/.exec(route);
      if (match && method === 'PATCH') {
        const comment = [...state.comments.values()].flat().find(item => item.id === Number(match[1]));
        comment.body = body.body; return structuredClone(comment);
      }
      if (route === '/actions/workflows/code-agent-task.yml/dispatches' && method === 'POST') { state.dispatches.push(body); return null; }
      if (route === '/actions/workflows/code-agent-task.yml/runs' && method === 'GET') return { workflow_runs: page(state.runs, query) };
      match = /^\/actions\/runs\/(\d+)\/attempts\/(\d+)\/jobs$/.exec(route);
      if (match) return { jobs: state.jobs.get(Number(match[1])) ?? [] };
      throw new Error(`Unexpected ${method} ${route}`);
    },
    // Simulate what the task workflow would do for a dispatched sample.
    run(issue, { id, status = 'completed', conclusion = 'success', delivered = true, handoff = false, previous = 0 }) {
      state.runs.push({ id, run_attempt: 1, status, conclusion, display_title: `Factory issue #${issue} build 0 from ${previous}`, created_at: new Date(Date.now() + id).toISOString() });
      state.jobs.set(id, [{ name: 'agent', conclusion: 'success', steps: handoff ? [{ name: 'Dispatch continuation run', conclusion: 'success' }] : [] },
        ...(delivered ? [{ name: 'publish', conclusion: 'success' }] : [])]);
    },
    samples() { return [...state.issues.values()].filter(issue => names(issue).includes(SAMPLE_LABEL)); },
  };
  return client;
}

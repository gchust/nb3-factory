// Repeatable evaluation batches: a trusted plan, one frozen baseline and case
// capture per batch, a complete planned-sample manifest, and a small serial
// coordinator that advances on explicit triggers, task completion and a
// low-frequency schedule. Every sample is an independent Issue that reuses the
// existing task pipeline; no worker, queue or database is added.
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listAll } from './comment-queue.mjs';
import { segmentPattern, taskEvaluationIdentity } from './evaluation-identity.mjs';
import { currentRevision, readBytes, readSubject } from './evaluation-registry.mjs';
import { canonicalJson, EXPORTER_VERSION, PRODUCER } from './evaluation-report.mjs';
import { BATCH_LABEL, chunkText, FINISHED_STATES, isBot, MANUAL_LABEL, manifestComment, markers, readManifest, readSampleReceipt, readState,
  readTerminals, SAMPLE_LABEL, SAMPLE_STATES, stateComment, verifyAncestor } from './evaluation-sample.mjs';
import { BUILD_LABEL, extractIssueSections, parseBuildReviewMode, parseIssueTask } from './factory-lib.mjs';
import { clonedBody, readPresetSource, replaceSection, writeSnapshot } from './issue-presets.mjs';
import { stripTaskTitle } from './task-compat.mjs';
import { taskOutcome } from './task-outcome.mjs';

export const PLAN_LIMITS = { plans: 20, cases: 10, samplesPerCase: 10, samplesPerPlan: 20, repairs: [0, 10], activeSeconds: [600, 86_400], continuations: [0, 10] };
const WORKFLOW = 'code-agent-task.yml';
// How long a finished batch waits for its samples' final reports before completing anyway.
const REPORT_GRACE_SECONDS = 6 * 3600;
// A queued sample without any Run after this long is dispatched again (the claim prevents a double build).
const REDISPATCH_AFTER_MS = 30 * 60_000;
// Non-secret settings that change how samples are built, tested or reviewed.
const AGENT_CONFIG_VARS = ['CODE_AGENT_ENGINE', 'CODE_AGENT_VERSION', 'PI_VERSION', 'CODEBUDDY_VERSION', 'CLAUDE_CODE_VERSION', 'CODEX_VERSION',
  'OPENCODE_VERSION', 'CODE_AGENT_MODEL', 'PI_MODEL', 'CODEBUDDY_MODEL', 'CLAUDE_CODE_MODEL', 'CODEX_MODEL', 'OPENCODE_MODEL', 'CODE_AGENT_API_TYPE',
  'CODE_AGENT_THINKING', 'PI_THINKING', 'CODEBUDDY_THINKING', 'CLAUDE_CODE_EFFORT', 'CLAUDE_CODE_QA_EFFORT', 'CODEX_REASONING_EFFORT', 'CODEX_QA_REASONING_EFFORT',
  'OPENCODE_VARIANT', 'OPENCODE_QA_VARIANT', 'FACTORY_QA_THINKING', 'FACTORY_REVIEW_THINKING', 'FACTORY_BUILD_REVIEW', 'FACTORY_BUILD_REVIEW_TIMEOUT_SECONDS',
  'CODE_AGENT_INVOCATION_TIMEOUT_SECONDS', 'CODE_AGENT_IDLE_TIMEOUT_SECONDS', 'AGENT_BROWSER_VERSION'];
export function agentConfig(env) {
  const values = Object.fromEntries(AGENT_CONFIG_VARS.filter(name => String(env[name] ?? '').trim()).map(name => [name, String(env[name]).trim().slice(0, 200)]));
  return { fingerprint: sha256(canonicalJson(values)), values };
}
const sha256 = value => createHash('sha256').update(value).digest('hex');
const positive = value => Number.isSafeInteger(value) && value > 0;
const integer = (value, [min, max]) => Number.isSafeInteger(value) && value >= min && value <= max;
const need = (condition, message) => { if (!condition) throw new Error(message); };
const only = (value, keys, name) => need(value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).every(key => keys.includes(key)), `${name}: unsupported or missing fields`);
const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const labelNames = issue => (issue.labels ?? []).map(label => label.name ?? label);

// Plans are maintained in the repository by trusted maintainers; bounds prevent a
// single misconfiguration from creating a large number of paid tasks.
export function validatePlans(document, { defaultBranch } = {}) {
  only(document, ['schemaVersion', 'plans'], 'plans.json');
  need(document.schemaVersion === 1 && Array.isArray(document.plans) && document.plans.length <= PLAN_LIMITS.plans, 'plans.json: schemaVersion 1 with at most 20 plans');
  const keys = new Set();
  return document.plans.map(plan => {
    only(plan, ['key', 'enabled', 'schedule', 'baselineRef', 'cases', 'execution', 'reviewMode'], `plan ${plan?.key}`);
    need(typeof plan.key === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(plan.key) && !keys.has(plan.key), `Invalid or duplicate plan key ${plan.key}`);
    keys.add(plan.key);
    need(typeof plan.enabled === 'boolean', `${plan.key}: enabled must be boolean`);
    need(plan.schedule === null || plan.schedule === 'daily', `${plan.key}: schedule must be null or daily`);
    need(!defaultBranch || plan.baselineRef === defaultBranch, `${plan.key}: v1 batches freeze the default branch (${defaultBranch}); prepared source baselines are not supported`);
    need(Array.isArray(plan.cases) && plan.cases.length > 0 && plan.cases.length <= PLAN_LIMITS.cases, `${plan.key}: 1–${PLAN_LIMITS.cases} cases`);
    const caseKeys = new Set();
    let total = 0;
    const cases = plan.cases.map(item => {
      only(item, ['key', 'presetIssueNumber', 'samples'], `${plan.key} case`);
      need(typeof item.key === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/.test(item.key) && !caseKeys.has(item.key), `${plan.key}: invalid or duplicate case key`);
      caseKeys.add(item.key);
      need(positive(item.presetIssueNumber), `${plan.key}/${item.key}: presetIssueNumber must be a positive Issue number`);
      need(integer(item.samples, [1, PLAN_LIMITS.samplesPerCase]), `${plan.key}/${item.key}: 1–${PLAN_LIMITS.samplesPerCase} samples`);
      total += item.samples;
      return { key: item.key, presetIssueNumber: item.presetIssueNumber, samples: item.samples };
    });
    need(total <= PLAN_LIMITS.samplesPerPlan, `${plan.key}: at most ${PLAN_LIMITS.samplesPerPlan} samples per batch`);
    only(plan.execution, ['maxConcurrentSamples', 'maxRepairAttempts', 'maxActiveSecondsPerSample', 'maxContinuations'], `${plan.key} execution`);
    const e = plan.execution;
    need(e.maxConcurrentSamples === 1, `${plan.key}: v1 runs one complete sample chain at a time`);
    need(integer(e.maxRepairAttempts, PLAN_LIMITS.repairs), `${plan.key}: maxRepairAttempts 0–10`);
    need(integer(e.maxActiveSecondsPerSample, PLAN_LIMITS.activeSeconds), `${plan.key}: maxActiveSecondsPerSample 600–86400`);
    need(e.maxContinuations === undefined || integer(e.maxContinuations, PLAN_LIMITS.continuations), `${plan.key}: maxContinuations 0–10`);
    need(['inherit', 'full', 'off'].includes(plan.reviewMode), `${plan.key}: reviewMode must be inherit, full or off`);
    return { key: plan.key, enabled: plan.enabled, schedule: plan.schedule, baselineRef: plan.baselineRef, cases, reviewMode: plan.reviewMode,
      execution: { maxConcurrentSamples: 1, maxRepairAttempts: e.maxRepairAttempts, maxActiveSecondsPerSample: e.maxActiveSecondsPerSample,
        maxContinuations: e.maxContinuations ?? PLAN_LIMITS.continuations[1] } };
  });
}

// Retry identity only: a scheduled slot is its UTC date, a manual start is its
// originating Run. Re-running any attempt of that Run resumes the same batch.
function batchKeyFor(plan, trigger, now, runId) {
  need(trigger === 'schedule' || /^[1-9]\d*$/.test(String(runId ?? '')), 'A manual batch needs its originating run ID');
  const key = trigger === 'schedule' ? `${plan.key}-${new Date(now).toISOString().slice(0, 10).replaceAll('-', '')}` : `${plan.key}-r${runId}`;
  need(segmentPattern.test(key), 'Invalid batch key');
  return key;
}

async function ensureLabel(client, name, description) {
  const route = `/labels/${encodeURIComponent(name)}`;
  if (await client.request('GET', route, { allow404: true })) return;
  try { await client.request('POST', '/labels', { body: { name, color: 'c5def5', description } }); }
  catch (error) { if (!await client.request('GET', route, { allow404: true })) throw error; }
}

export async function coordinators(client, state = 'all') {
  return (await listAll(client, '/issues', { state, labels: BATCH_LABEL })).filter(issue => !issue.pull_request && isBot(issue.user));
}
async function findCoordinator(client, batchKey) {
  const found = (await coordinators(client)).filter(issue => (issue.body ?? '').includes(markers.batch(batchKey)));
  need(found.length <= 1, `Ambiguous coordinator Issues for batch ${batchKey}`);
  return found[0] ?? null;
}

export async function loadBatch(client, coordinator) {
  const comments = await listAll(client, `/issues/${coordinator.number}/comments`);
  const loaded = readManifest(comments);
  if (!loaded) return { coordinator, comments, manifest: null };
  const latest = readState(comments, loaded.manifest.batchKey, loaded.hash);
  return { coordinator, comments, manifest: loaded.manifest, manifestHash: loaded.hash, state: latest?.state ?? null };
}

function summaryTable(manifest, state) {
  const rows = manifest.samples.map(sample => {
    const item = state.samples[sample.key];
    return `| ${sample.caseKey} | ${sample.sampleIndex} | ${item.issue ? `#${item.issue}` : '—'} | ${item.state} | ${item.report?.state === 'available' ? `r${item.report.revision}` : '未取得'} |`;
  });
  return [`### 评测批次 \`${manifest.batchKey}\` · ${state.state === 'active' ? (state.cancelled ? '取消中' : '进行中') : state.state === 'cancelled' ? '已取消' : '已结束'}`,
    '', `快照 ${state.sequence}。冻结控制代码 \`${manifest.controlSha.slice(0, 12)}\`，应用基线 \`${manifest.applicationBaseSha.slice(0, 12)}\`。`,
    '', '| 案例 | 样本 | Issue | 状态 | 报告 |', '| --- | ---: | --- | --- | --- |', ...rows,
    '', '样本状态由持久清单与可信终态决定；“已派发”不代表验收通过。不计算 NocoBase 全局平均评分。'].join('\n');
}
async function saveState(client, batch, state) {
  state.updatedAt ??= state.createdAt;
  const comment = await client.addComment(batch.coordinator.number, stateComment(state, batch.manifestHash, summaryTable(batch.manifest, state)));
  batch.comments.push(comment);
  batch.state = state;
}

// Freeze everything a sample depends on exactly once, before any sample exists.
async function freezeBatch(client, { plan, batchKey, trigger, now, controlSha, env, coordinatorIssue }) {
  const repository = await client.getRepository();
  const defaultBranch = repository.default_branch;
  need(plan.baselineRef === defaultBranch, `${plan.key}: v1 batches freeze the default branch`);
  need(/^[a-f0-9]{40}$/.test(controlSha ?? ''), 'The coordinator control SHA is required');
  await verifyAncestor(client, controlSha, defaultBranch);
  const lock = await readBytes(client, 'pnpm-lock.yaml', controlSha);
  need(lock, 'The frozen baseline has no pnpm-lock.yaml; it is not a usable application baseline');
  let templateVersion = null;
  try { templateVersion = JSON.parse((await readBytes(client, 'factory-template.json', controlSha))?.toString('utf8') ?? 'null')?.templateVersion ?? null; }
  catch { /* Optional descriptor. */ }
  const cases = [];
  for (const item of plan.cases) {
    const { source, comments } = await readPresetSource(client, item.presetIssueNumber);
    // Validate the business fields once; each sample receives this exact capture.
    parseIssueTask({ ...source, body: replaceSection(source.body ?? '', '目标分支', defaultBranch) });
    const captured = parseBuildReviewMode(extractIssueSections(source.body ?? '').get('框架评测'));
    const buildReviewMode = plan.reviewMode === 'inherit' ? captured ?? (env.FACTORY_BUILD_REVIEW === 'off' ? 'off' : 'full') : plan.reviewMode;
    const snapshot = { source, comments };
    cases.push({ key: item.key, presetIssueNumber: item.presetIssueNumber, title: source.title, samples: item.samples,
      caseHash: sha256(canonicalJson(snapshot)), capturedAt: iso(now), commentCount: comments.length, buildReviewMode, snapshot });
  }
  const samples = plan.cases.flatMap(item => Array.from({ length: item.samples }, (_, index) => {
    const identity = taskEvaluationIdentity({ repository: client.repository, issueNumber: 1, sample: { batchKey, caseKey: item.key, sampleIndex: index + 1 } });
    return { key: identity.sampleKey, caseKey: item.key, sampleIndex: index + 1, runKey: identity.runKey };
  }));
  return {
    version: 1, type: 'evaluation-batch-manifest', repository: client.repository, batchKey, planKey: plan.key,
    planFingerprint: sha256(canonicalJson(plan)), trigger, slot: trigger === 'schedule' ? iso(now).slice(0, 10) : null, createdAt: iso(now),
    coordinatorIssue, defaultBranch, controlSha, entrySha: /^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') ? env.GITHUB_SHA : null,
    applicationBaseSha: controlSha, lockfileSha256: sha256(lock), templateVersion, reviewMode: plan.reviewMode,
    budget: { maxRepairAttempts: plan.execution.maxRepairAttempts, maxActiveSeconds: plan.execution.maxActiveSecondsPerSample,
      maxContinuations: plan.execution.maxContinuations },
    maxConcurrentSamples: plan.execution.maxConcurrentSamples, agentEngine: env.CODE_AGENT_ENGINE || 'pi', agentConfig: agentConfig(env), cases, samples,
  };
}

export async function startBatch(client, { plans, planKey, trigger, now = Date.now(), runId, controlSha, env = {}, dryRun = false }) {
  const plan = plans.find(item => item.key === planKey);
  need(plan, `Unknown evaluation plan ${planKey}`);
  if (trigger === 'schedule' && (!plan.enabled || plan.schedule !== 'daily')) return { status: 'skipped', reason: `${plan.key} is not an enabled daily plan` };
  const batchKey = batchKeyFor(plan, trigger, now, runId);
  let coordinator = await findCoordinator(client, batchKey);
  let frozen = null;
  const own = coordinator ? await loadBatch(client, coordinator) : null;
  // Creating a batch and resuming an unfinished start share one exclusion check,
  // which excludes only the batch itself. An unreadable open batch fails the start.
  if (!own || !own.manifest || !own.state) {
    const active = [];
    for (const issue of await coordinators(client, 'open')) {
      if (issue.number === coordinator?.number) continue;
      const other = await loadBatch(client, issue);
      if (occupiesSlot(other)) active.push(other.manifest?.batchKey ?? `#${issue.number}`);
    }
    if (active.length) {
      if (trigger === 'schedule') return { status: 'skipped', reason: `Another batch is active or unfinished: ${active.join(', ')}` };
      throw new Error(`Only one active batch is supported in v1; active or unfinished: ${active.join(', ')}. Resume its start or cancel it, or wait.`);
    }
  }
  if (!coordinator) {
    // Freeze and validate first: a wrong case number or unusable baseline creates nothing.
    frozen = await freezeBatch(client, { plan, batchKey, trigger, now, controlSha, env, coordinatorIssue: 0 });
    if (dryRun) return { status: 'planned', batchKey, manifest: frozen };
    await ensureLabel(client, BATCH_LABEL, 'Evaluation batch coordination record (never a build task)');
    await ensureLabel(client, MANUAL_LABEL, 'Factory maintenance Issue; never enters the Code Agent queue');
    coordinator = await client.request('POST', '/issues', { body: {
      title: `[评测批次] ${plan.key} · ${batchKey}`.slice(0, 250), labels: [MANUAL_LABEL, BATCH_LABEL],
      body: `${markers.batch(batchKey)}\n\n评测批次协调记录：冻结计划、基线与案例快照，串行推进独立样本 Issue。\n\n` +
        '这是维护 Issue（`factory:manual`），不会进入业务 Agent 队列；请勿删除机器人快照评论。取消批次请运行 **Evaluation batches** 的 `cancel`。' } });
  }
  const batch = own ?? await loadBatch(client, coordinator);
  if (!batch.manifest) {
    // An interrupted start never dispatched a sample, so freezing again is safe and complete.
    const manifest = frozen ? { ...frozen, coordinatorIssue: coordinator.number }
      : await freezeBatch(client, { plan, batchKey, trigger, now, controlSha, env, coordinatorIssue: coordinator.number });
    const json = JSON.stringify(manifest);
    const hash = sha256(json);
    const parts = chunkText(Buffer.from(json).toString('base64'));
    for (const [index, part] of parts.entries()) batch.comments.push(await client.addComment(coordinator.number, manifestComment(hash, index, parts.length, part)));
    Object.assign(batch, { manifest, manifestHash: hash });
  }
  if (!batch.state) {
    await saveState(client, batch, { version: 1, batchKey, manifestHash: batch.manifestHash, sequence: 1, state: 'active', cancelled: false,
      createdAt: iso(now), updatedAt: iso(now),
      samples: Object.fromEntries(batch.manifest.samples.map(s => [s.key, newSample()])) });
  }
  return { status: 'started', batchKey, coordinator: coordinator.number, batch };
}

// Only a batch confirmed completed or cancelled frees the single active slot; a batch
// missing its manifest or first state is an unfinished start, not a finished batch.
const occupiesSlot = batch => !batch.manifest || !batch.state || !['completed', 'cancelled'].includes(batch.state.state);

async function findSampleIssue(client, sampleKey, since) {
  const found = (await listAll(client, '/issues', { state: 'all', labels: SAMPLE_LABEL, since }))
    .filter(issue => !issue.pull_request && isBot(issue.user) && (issue.body ?? '').includes(markers.sample(sampleKey)));
  need(found.length <= 1, `Duplicate Issues exist for sample ${sampleKey}`);
  return found[0] ?? null;
}

// Idempotent: a retry after "Issue created, response lost" finds the marker and resumes.
async function ensureSample(client, batch, spec) {
  const { manifest, manifestHash } = batch;
  const frozen = manifest.cases.find(item => item.key === spec.caseKey);
  const title = (stripTaskTitle(frozen.snapshot.source.title) || '从预置案例重新搭建').slice(0, 250);
  await ensureLabel(client, SAMPLE_LABEL, 'Independent evaluation-batch sample created by the coordinator');
  await client.ensureStatusLabels();
  let issue = await findSampleIssue(client, spec.key, manifest.createdAt);
  if (!issue) {
    issue = await client.request('POST', '/issues', { body: { title,
      body: `评测样本准备中；冻结输入写入完成前不会开始搭建。\n\n${markers.sample(spec.key)}`, labels: [BUILD_LABEL, SAMPLE_LABEL, 'agent:pending'] } });
  }
  const comments = await listAll(client, `/issues/${issue.number}/comments`);
  const snapshot = { version: 1, issueNumber: issue.number, targetBranch: manifest.defaultBranch, buildReviewMode: frozen.buildReviewMode,
    capturedAt: frozen.capturedAt, source: frozen.snapshot.source, extra: '', comments: frozen.snapshot.comments };
  const { hash } = await writeSnapshot(client, issue.number, snapshot, comments);
  const base = comments.filter(c => isBot(c.user) && (c.body ?? '').startsWith('<!-- factory-task-base-v1:'));
  if (base.some(c => !c.body.includes(`"sha":"${manifest.applicationBaseSha}"`))) throw new Error(`Sample ${spec.key} already pins another application base`);
  if (!base.length) {
    const receipt = JSON.stringify({ repository: client.repository, issueNumber: issue.number, targetBranch: manifest.defaultBranch, sha: manifest.applicationBaseSha });
    comments.push(await client.addComment(issue.number, `<!-- factory-task-base-v1:${receipt} -->\n\n评测批次 \`${manifest.batchKey}\` 冻结的代码起点：\`${manifest.defaultBranch} @ ${manifest.applicationBaseSha}\`。样本重试与续跑不会跟随默认分支移动。`));
  }
  if (!readSampleReceipt(comments, issue.number)) {
    const receipt = { version: 1, repository: client.repository, issueNumber: issue.number, batchKey: manifest.batchKey, sampleKey: spec.key,
      caseKey: spec.caseKey, sampleIndex: spec.sampleIndex, coordinatorIssue: manifest.coordinatorIssue, manifestHash, controlSha: manifest.controlSha,
      baseSha: manifest.applicationBaseSha, lockfileSha256: manifest.lockfileSha256, buildReviewMode: frozen.buildReviewMode, budget: manifest.budget };
    comments.push(await client.addComment(issue.number, `${markers.receipt}${JSON.stringify(receipt)} -->\n\n评测批次 \`${manifest.batchKey}\` 的独立样本 ` +
      `\`${spec.key}\`（[协调记录 #${manifest.coordinatorIssue}](https://github.com/${client.repository}/issues/${manifest.coordinatorIssue})）。` +
      `预算：修复 ≤ ${manifest.budget.maxRepairAttempts} 次，主动执行 ≤ ${manifest.budget.maxActiveSeconds} 秒，续跑 ≤ ${manifest.budget.maxContinuations} 次。`));
  }
  // Last: until every input exists the Issue is not a runnable preset copy.
  if (!(issue.body ?? '').startsWith('<!-- factory-preset-ready:')) {
    issue = await client.request('PATCH', `/issues/${issue.number}`, { body: {
      title,
      body: `${clonedBody(snapshot, hash)}\n\n${markers.sample(spec.key)}\n` } });
  }
  return { issue, comments };
}

async function runsFor(client, issueNumber, since) {
  const runs = [];
  for (let page = 1; page <= 10; page++) {
    const { workflow_runs: batch } = await client.request('GET', `/actions/workflows/${WORKFLOW}/runs`, { query: { created: `>=${since}`, per_page: 100, page } });
    runs.push(...batch.filter(run => run.display_title?.startsWith(`Factory issue #${issueNumber} build 0 `)));
    if (batch.length < 100) break;
  }
  return runs.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id);
}

async function dispatch(client, batch, spec, issue, comments) {
  await client.request('POST', `/actions/workflows/${WORKFLOW}/dispatches`, { body: { ref: batch.manifest.defaultBranch, inputs: { issue_number: String(issue.number) } } });
  const { comment } = readSampleReceipt(comments, issue.number);
  if (!comment.body.includes(markers.dispatched(spec.key)))
    await client.request('PATCH', `/issues/comments/${comment.id}`, { body: { body: `${comment.body}\n\n${markers.dispatched(spec.key)}\n已派发到搭建工作流；这不表示验收已通过。` } });
}

// ---- Sample lifecycle --------------------------------------------------------
// planned → queued (dispatched) → running (a Run is active, or a handoff chain
// continues) → finished (FINISHED_STATES). A finished sample names the execution
// its result belongs to (`final`: run ID + attempt) and where the result came from
// (`stateSource`): that execution's report, its Run conclusion, a prepare decision
// or the batch itself. Only report/run results expect a report, and only the report
// of exactly that execution is ever the sample's report.
const newSample = () => ({ state: 'planned', stateSource: 'plan', issue: null, dispatchedAt: null, terminalAt: null,
  final: null, report: null, reason: null, configObserved: [] });
const executionOf = run => ({ runId: run.id, attempt: run.run_attempt ?? 1 });
const finished = (state, stateSource, run, reason) => ({ state, stateSource, final: run ? executionOf(run) : null, ...(reason ? { reason } : {}) });
const expectsReport = item => Boolean(item.issue && item.final && ['run', 'report'].includes(item.stateSource));
// The settings sequence as observed, collapsing only consecutive repeats (A → B → A
// stays three entries), so the last entry is the latest settings.
const observeConfig = (item, fingerprint) => {
  item.configObserved ??= [];
  if (fingerprint && item.configObserved.at(-1) !== fingerprint) item.configObserved.push(fingerprint);
};

// The newest revision describing exactly this execution is its report (a later
// reassessment of it may add one); other attempts and handoff segments stay history.
// A publication-only re-run still gets its own report, produced for that attempt.
// A failed read throws: it must never look like "no report" and erase a confirmed one.
async function reportFor(client, runKey, final) {
  if (!final) return null;
  const index = await readSubject(client, 'evaluation-report', runKey, 'gh-pages');
  const matching = (index?.revisions ?? []).filter(item => item.precedence?.producer?.runId === final.runId &&
    (item.precedence?.producer?.attempt ?? 1) === final.attempt);
  if (!matching.length) return null;
  const entry = matching.find(item => item.revision === currentRevision('evaluation-report', matching));
  return { revision: entry.revision, ...entry.summary };
}
const fromReport = summary => summary.execution === 'budget-exhausted' ? 'budget-exhausted' : summary.execution === 'blocked' ? 'blocked'
  : summary.execution === 'cancelled' ? 'cancelled' : summary.acceptance === 'passed' ? 'passed'
    : ['failed', 'blocked'].includes(summary.acceptance) ? summary.acceptance : summary.execution === 'timed-out' ? 'failed' : 'unknown';
const fromRun = (outcome, issue) => outcome === 'delivered' ? 'passed' : outcome === 'cancelled' ? 'cancelled'
  : outcome === 'failure' ? (labelNames(issue).includes('agent:needs-input') ? 'blocked' : 'failed') : outcome === 'timed_out' ? 'failed' : 'unknown';

// Observation of a dispatched chain: { state: 'running' } while any Run is active or a
// handoff continues, { state: 'queued' } before any Run did work, otherwise finished()
// from the Run alone; the report of that execution is read once, by applyReport.
async function observeSample(client, batch, item, spec, now) {
  const { manifest } = batch;
  const issue = await client.getIssue(item.issue);
  const runs = await runsFor(client, item.issue, new Date(Date.parse(item.dispatchedAt ?? manifest.createdAt) - 10 * 60_000).toISOString());
  const stale = item.dispatchedAt && now - Date.parse(item.dispatchedAt) > (manifest.budget.maxActiveSeconds * 3 + 6 * 3600) * 1000;
  // Unfinished work keeps the slot: "no progress" is not "terminated"; only a
  // maintainer's cancellation of the Run can end it.
  if (runs.some(run => run.status !== 'completed'))
    return { state: 'running', reason: stale ? '超过墙钟保护期限仍有未结束的 Run；不释放串行槽位，需要维护者检查或取消该 Run。' : item.reason ?? null };
  const terminals = readTerminals(await listAll(client, `/issues/${item.issue}/comments`), spec.key);
  // The latest Run that did something: a prepare decision, an Agent execution or a
  // failure. A duplicate or waiting dispatch ends after prepare with success and is ignored.
  let latest = null, jobs = [];
  for (const run of [...runs].reverse()) {
    if (terminals.has(run.id)) return finished(terminals.get(run.id), 'prepare', run);
    ({ jobs } = await client.request('GET', `/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, { query: { per_page: 100 } }));
    if (run.conclusion !== 'success' || jobs.some(job => job.name === 'agent' && job.conclusion && job.conclusion !== 'skipped')) { latest = run; break; }
  }
  if (!latest) {
    // Rejected at prepare: no build ran and no report will follow.
    if (labelNames(issue).includes('agent:needs-input')) return finished('blocked', 'prepare', runs.at(-1), '样本输入未通过受理，需要维护者处理。');
    return { state: 'queued', redispatch: !runs.length && (!item.dispatchedAt || now - Date.parse(item.dispatchedAt) > REDISPATCH_AFTER_MS) };
  }
  const outcome = taskOutcome(latest, jobs);
  // Exit 75 is not terminal. Only a handoff with no Run for that long is released;
  // prepare and admission then refuse any late continuation of the released sample.
  if (outcome === 'handoff') return stale ? finished('unknown', 'run', latest, 'Handoff 后长时间没有续跑；释放串行槽位，迟到的续跑会在 prepare 被拒绝。') : { state: 'running' };
  return finished(fromRun(outcome, issue), 'run', latest);
}

function applyObservation(item, observed, { stamp, cancelled, fingerprint }) {
  if (FINISHED_STATES.has(observed.state)) {
    Object.assign(item, { state: observed.state, stateSource: observed.stateSource, final: observed.final, terminalAt: stamp, reason: observed.reason ?? item.reason });
  } else if (cancelled && observed.state === 'queued') {
    // Cancelled while only queued: no Run is in progress and none did any work, so there
    // is nothing to wait for. No task is dispatched to make it exit.
    Object.assign(item, { state: 'cancelled', stateSource: 'batch', final: null, terminalAt: stamp, reason: '批次已取消；该样本没有实际执行（派发未产生搭建 Run），直接结束。' });
  } else {
    item.state = observed.state;
    if (observed.reason !== undefined) item.reason = observed.reason;
    // Settings in effect while the chain is still active count for comparability;
    // the advance that finds it finished is not evidence of how it ran.
    observeConfig(item, fingerprint);
  }
}

// The report of a finished sample's final execution (or none); the state follows its
// newest revision unless the result came from a prepare or batch decision.
function applyReport(item, summary) {
  if (!summary) { item.report = null; return; }
  item.report = { state: 'available', revision: summary.revision, execution: summary.execution ?? null, acceptance: summary.acceptance ?? null };
  if (['run', 'report'].includes(item.stateSource)) Object.assign(item, { state: fromReport(summary), stateSource: 'report' });
}

export async function advanceBatch(client, batch, { now = Date.now(), env = null } = {}) {
  const { manifest } = batch;
  const state = structuredClone(batch.state);
  const stamp = iso(now);
  const samples = () => manifest.samples.map(spec => ({ spec, item: state.samples[spec.key] }));
  // The settings in effect for this trigger; drift from the frozen batch is recorded.
  const fingerprint = env ? agentConfig(env).fingerprint : null;
  const frozenConfig = manifest.agentConfig?.fingerprint ?? null;
  if (fingerprint && frozenConfig && fingerprint !== frozenConfig && state.state === 'active' && !state.agentConfigDrift)
    state.agentConfigDrift = { observedAt: stamp, fingerprint };
  // Append a new snapshot only when something actually changed.
  const commit = async () => {
    if (JSON.stringify(state) === JSON.stringify(batch.state)) return;
    Object.assign(state, { sequence: batch.state.sequence + 1, updatedAt: stamp });
    await saveState(client, batch, structuredClone(state));
  };
  const redispatch = async (spec, item) => {
    const { issue, comments } = await ensureSample(client, batch, spec);
    await dispatch(client, batch, spec, issue, comments);
    Object.assign(item, { dispatchedAt: stamp, reason: '派发后未出现搭建 Run，已按同一样本重新派发。' });
  };

  // 1. Observe every dispatched chain that has not finished.
  if (state.state === 'active') {
    for (const { spec, item } of samples()) {
      if (!['queued', 'running'].includes(item.state) || !item.issue) continue;
      const observed = await observeSample(client, batch, item, spec, now);
      if (observed.redispatch && !state.cancelled) await redispatch(spec, item);
      applyObservation(item, observed, { stamp, cancelled: state.cancelled, fingerprint });
    }
  }
  // 2. Reports keep arriving after samples finish, also while a finished batch waits
  //    for its archive. Public report fields never fall back to another execution.
  for (const { spec, item } of samples()) {
    if (item.issue) applyReport(item, expectsReport(item) && FINISHED_STATES.has(item.state) ? await reportFor(client, spec.runKey, item.final) : null);
  }
  if (state.state === 'active') {
    // 3. A cancelled batch dispatches nothing more.
    if (state.cancelled) for (const { item } of samples()) {
      if (item.state === 'planned') Object.assign(item, { state: 'cancelled', stateSource: 'batch', terminalAt: stamp, reason: '批次已取消，未派发。' });
    }
    // 4. Fill the serial slot with the next planned sample.
    const occupied = samples().filter(({ item }) => ['queued', 'running'].includes(item.state)).length;
    const next = samples().find(({ item }) => item.state === 'planned');
    if (!state.cancelled && next && occupied < manifest.maxConcurrentSamples) {
      const { issue, comments } = await ensureSample(client, batch, next.spec);
      Object.assign(next.item, { state: 'queued', stateSource: 'coordinator', issue: issue.number, dispatchedAt: stamp });
      observeConfig(next.item, fingerprint);
      // Persist the assignment first: the sample pin requires it before prepare runs.
      await commit();
      if (!(await runsFor(client, issue.number, manifest.createdAt)).length) {
        try { await dispatch(client, batch, next.spec, issue, comments); }
        catch (error) {
          // Recorded, so the next trigger re-dispatches instead of waiting for a run that never started.
          Object.assign(next.item, { dispatchedAt: null, reason: `派发失败：${error.message.slice(0, 200)}` });
          await commit();
          throw error;
        }
      }
    }
    // 5. Complete when every sample finished and each final report arrived (samples ended
    //    at prepare or by the batch have none), or once the grace period has passed.
    const items = samples().map(({ item }) => item);
    const lastFinished = Math.max(0, ...items.map(item => Date.parse(item.terminalAt ?? '') || 0));
    if (items.every(item => FINISHED_STATES.has(item.state)) &&
        (items.every(item => !expectsReport(item) || item.report) || now - lastFinished > REPORT_GRACE_SECONDS * 1000)) {
      Object.assign(state, { state: state.cancelled ? 'cancelled' : 'completed', completedAt: stamp });
    }
  }
  await commit();
  // 6. Finishing and archiving are separate: the coordinator stays open (without
  //    blocking a new batch) until the snapshot of this exact sequence is registered.
  if (batch.state.state !== 'active' && batch.coordinator.state === 'open' && await finalSnapshotRegistered(client, batch))
    batch.coordinator = await client.request('PATCH', `/issues/${batch.coordinator.number}`, { body: { state: 'closed' } });
  return batch;
}

export async function finalSnapshotRegistered(client, batch) {
  let index = null;
  try { index = await readSubject(client, 'evaluation-batch', `${batch.manifest.repository}/batches/${batch.manifest.batchKey}`, 'gh-pages'); }
  catch { return false; }
  return Boolean(index?.revisions.some(item => item.precedence?.sequence === batch.state.sequence));
}

export async function cancelBatch(client, batchKey, { now = Date.now() } = {}) {
  const coordinator = await findCoordinator(client, batchKey);
  need(coordinator, `Unknown batch ${batchKey}`);
  const batch = await loadBatch(client, coordinator);
  if (!batch.manifest || !batch.state) {
    // An interrupted start never dispatched a sample; closing it unblocks new batches.
    await client.addComment(coordinator.number, `评测批次 \`${batchKey}\` 没有完整的冻结清单，未派发任何样本；按取消请求关闭。`);
    batch.coordinator = await client.request('PATCH', `/issues/${coordinator.number}`, { body: { state: 'closed' } });
    return batch;
  }
  if (batch.state.state === 'active' && !batch.state.cancelled) {
    await saveState(client, batch, { ...structuredClone(batch.state), cancelled: true, cancelledAt: iso(now), sequence: batch.state.sequence + 1, updatedAt: iso(now) });
  }
  return advanceBatch(client, batch, { now });
}

// Public, versioned snapshot of the whole planned set. Missing reports stay listed.
export function batchDocument(batch, { exporter = {} } = {}) {
  const { manifest, state, manifestHash } = batch;
  const frozenConfig = manifest.agentConfig?.fingerprint ?? null;
  const samples = manifest.samples.map(spec => {
    const item = state.samples[spec.key];
    const observed = item.configObserved ?? [];
    return { key: spec.key, caseKey: spec.caseKey, sampleIndex: spec.sampleIndex, runKey: spec.runKey, issue: item.issue ?? null,
      state: item.state, stateSource: item.stateSource ?? 'plan', dispatchedAt: item.dispatchedAt ?? null, terminalAt: item.terminalAt ?? null,
      reason: item.reason ?? null, agentConfigFingerprint: observed.at(-1) ?? null,
      comparable: !item.issue || !observed.length || !frozenConfig ? null : observed.every(value => value === frozenConfig),
      // Ended at prepare or by the batch: no build ran, so no report will exist.
      report: item.report ?? { state: FINISHED_STATES.has(item.state) && !expectsReport(item) ? 'not-applicable' : 'missing', revision: null, execution: null, acceptance: null } };
  });
  const byState = Object.fromEntries(SAMPLE_STATES.map(name => [name, samples.filter(s => s.state === name).length]));
  const available = samples.filter(s => s.report.state === 'available').length;
  const notApplicable = samples.filter(s => s.report.state === 'not-applicable').length;
  const missing = samples.length - available - notApplicable;
  const limitations = [
    { code: 'no-global-score', detail: '批次只列出同条件样本的可核实事实，不计算 NocoBase 全局平均评分，也不排除失败样本。' },
    { code: 'agent-config-runtime', detail: '样本按运行时仓库变量执行 Agent；批次只冻结并比对非密钥配置指纹，漂移单独标记，逐样本报告记录实际引擎与模型。' },
  ];
  if (missing) limitations.push({ code: 'reports-missing', detail: `${missing} 个计划样本尚无其最终执行的报告（未开始、执行中或报告未到达）；它们仍计入样本全集，验收计入“其他”。` });
  if (state.cancelled) limitations.push({ code: 'batch-cancelled', detail: '批次已取消：未开始的样本不再派发，已发生的执行与用量保留。' });
  const drifted = samples.filter(s => s.comparable === false).length;
  if (state.agentConfigDrift || drifted) limitations.push({ code: 'agent-config-drift',
    detail: `批次期间 Agent 配置指纹发生变化${drifted ? `，${drifted} 个样本在不同配置下派发` : ''}；这些结果不能与其他样本直接比较。` });
  if (!frozenConfig) limitations.push({ code: 'agent-config-unrecorded', detail: '冻结清单没有 Agent 配置指纹，样本之间的配置一致性未知。' });
  return {
    schemaVersion: 1, type: 'evaluation-batch',
    source: { producer: PRODUCER, instance: manifest.repository, project: manifest.repository,
      exporter: { version: EXPORTER_VERSION, controlSha: /^[a-f0-9]{40}$/.test(exporter.controlSha ?? '') ? exporter.controlSha : null,
        runId: positive(Number(exporter.runId)) ? Number(exporter.runId) : null, attempt: positive(Number(exporter.attempt)) ? Number(exporter.attempt) : null } },
    batch: { key: manifest.batchKey, subjectKey: `${manifest.repository}/batches/${manifest.batchKey}`, planKey: manifest.planKey,
      planFingerprint: manifest.planFingerprint, manifestSha256: manifestHash, trigger: manifest.trigger, slot: manifest.slot,
      coordinatorIssue: manifest.coordinatorIssue, frozenAt: manifest.createdAt, sequence: state.sequence },
    state: state.state, cancelled: state.cancelled === true,
    baseline: { controlSha: manifest.controlSha, entrySha: manifest.entrySha, applicationBaseSha: manifest.applicationBaseSha,
      defaultBranch: manifest.defaultBranch, lockfileSha256: manifest.lockfileSha256, templateVersion: manifest.templateVersion,
      reviewMode: manifest.reviewMode, budget: manifest.budget, maxConcurrentSamples: manifest.maxConcurrentSamples, agentEngine: manifest.agentEngine,
      agentConfig: manifest.agentConfig ?? null },
    cases: manifest.cases.map(item => ({ key: item.key, presetIssueNumber: item.presetIssueNumber, title: item.title, caseHash: item.caseHash,
      capturedAt: item.capturedAt, commentCount: item.commentCount, buildReviewMode: item.buildReviewMode, samples: item.samples })),
    samples,
    summary: { planned: samples.length, byState, reports: { available, missing, notApplicable },
      comparable: !state.agentConfigDrift && !drifted && Boolean(frozenConfig),
      acceptance: { passed: samples.filter(s => s.report.acceptance === 'passed').length, failed: samples.filter(s => s.report.acceptance === 'failed').length,
        other: samples.filter(s => !['passed', 'failed'].includes(s.report.acceptance)).length } },
    limitations,
  };
}

// A sample run requests an advance from its own last job; wait until it has completed.
async function waitForRun(client, runId, { attempts = 30, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  for (let n = 0; n < attempts; n++) {
    const run = await client.request('GET', `/actions/runs/${runId}`);
    if (run?.status === 'completed' || run?.path !== '.github/workflows/code-agent-task.yml') return run;
    await pause(10_000);
  }
  return null; // The hourly compensation still advances later.
}

// Several batches can be open at once (one running, others awaiting their final
// archive), so each snapshot gets its own directory and is registered on its own.
export function writeBatchExport(output, batch, exporter = {}) {
  const key = batch.manifest.batchKey;
  need(segmentPattern.test(key), 'Invalid batch key for export');
  const directory = path.join(output, key);
  mkdirSync(path.join(directory, 'files'), { recursive: true });
  writeFileSync(path.join(directory, 'draft.json'), `${JSON.stringify(batchDocument(batch, { exporter }), null, 2)}\n`);
  writeFileSync(path.join(directory, 'files.json'), '[]\n');
  return key;
}

// Each batch (and each scheduled plan) is coordinated on its own: an error is
// recorded and the rest still advance and export, so one failing batch never
// keeps another from being archived. The caller still fails visibly.
export async function runCoordinator(client, { action, args = {}, env = {}, exporter = {}, readPlans }) {
  if (/^[1-9]\d*$/.test(args['source-run'] ?? '')) await waitForRun(client, Number(args['source-run']));
  const lines = [], exported = [], failures = [];
  const exportBatch = batch => { if (args.output && batch?.manifest) exported.push(writeBatchExport(args.output, batch, exporter)); };
  const isolated = async (context, work) => {
    try { await work(); }
    catch (error) {
      const label = context.label;
      failures.push({ label, error: error.message.slice(0, 300) });
      lines.push(`### ${label} 本轮协调失败\n\n${error.message.slice(0, 300)}\n\n已记录；其他批次照常推进与归档，下一次推进会重试。`);
    }
  };
  if (action === 'start' || action === 'scheduled') {
    const plans = await readPlans();
    const selected = action === 'scheduled' ? (env.FACTORY_EVALUATION_PLANS_ENABLED === 'true' ? plans.filter(p => p.enabled && p.schedule === 'daily') : []) : [plans.find(p => p.key === args.plan)];
    if (action === 'scheduled' && !selected.length) lines.push('没有启用的定时评测计划（需要 FACTORY_EVALUATION_PLANS_ENABLED=true 且计划 enabled + schedule=daily）；未创建任务。');
    for (const plan of selected) {
      need(plan, `Unknown evaluation plan ${args.plan}`);
      await isolated({ label: plan.key }, async () => {
        const result = await startBatch(client, { plans, planKey: plan.key, trigger: action === 'scheduled' ? 'schedule' : 'manual', runId: env.GITHUB_RUN_ID,
          controlSha: env.FACTORY_CONTROL_SHA, env, dryRun: args['dry-run'] === 'true' });
        if (result.status === 'planned') lines.push(`只预览 ${result.batchKey}：${result.manifest.samples.length} 个样本，基线 ${result.manifest.controlSha.slice(0, 12)}；没有写入或派发。`);
        else if (result.status === 'skipped') lines.push(`跳过 ${plan.key}：${result.reason}`);
        else { const batch = await advanceBatch(client, result.batch, { env }); exportBatch(batch); lines.push(summaryTable(batch.manifest, batch.state)); }
      });
    }
  } else if (action === 'advance' || action === 'status') {
    // Loading is part of each batch's isolation: one unreadable batch (identified by
    // its Issue until its key is known) cannot stop the others.
    for (const issue of await coordinators(client, 'open')) {
      const context = { label: `#${issue.number}` };
      await isolated(context, async () => {
        const batch = await loadBatch(client, issue);
        if (!batch.manifest || !batch.state) return;
        context.label = `${batch.manifest.batchKey} (#${issue.number})`;
        const next = action === 'advance' ? await advanceBatch(client, batch, { env }) : batch;
        exportBatch(next); lines.push(summaryTable(next.manifest, next.state));
      });
    }
    if (!lines.length) lines.push('没有进行中的评测批次。');
  } else if (action === 'cancel') {
    need(segmentPattern.test(args.batch ?? ''), 'cancel requires --batch <batchKey>');
    const batch = await cancelBatch(client, args.batch);
    exportBatch(batch); lines.push(summaryTable(batch.manifest, batch.state));
  } else throw new Error('Usage: evaluation-batch.mjs <start|scheduled|advance|status|cancel> ...');
  return { lines, exported, failures };
}

async function main() {
  const [action, ...argv] = process.argv.slice(2);
  const args = Object.fromEntries(Array.from({ length: argv.length / 2 }, (_, i) => [argv[i * 2].replace(/^--/, ''), argv[i * 2 + 1]]));
  const { GitHubClient } = await import('./factory-lib.mjs');
  const client = new GitHubClient({ token: process.env.GITHUB_TOKEN, repository: process.env.GITHUB_REPOSITORY, apiUrl: process.env.GITHUB_API_URL });
  const env = process.env;
  // Running batches depend only on their frozen manifests; plans are read for starts only.
  const readPlans = async () => validatePlans(JSON.parse(readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../evaluations/plans.json'), 'utf8')),
    { defaultBranch: (await client.getRepository()).default_branch });
  const { lines, exported, failures } = await runCoordinator(client, { action, args, env, readPlans,
    exporter: { controlSha: env.FACTORY_CONTROL_SHA, runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT } });
  // Written even when a batch failed, so the others still reach the archive matrix.
  if (exported.length && env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `export=true\nbatches=${JSON.stringify(exported)}\n`);
  const text = `# 评测批次\n\n${lines.join('\n\n')}\n`;
  console.log(text);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, text);
  if (failures.length) {
    console.error(`::error::${failures.length} evaluation batch(es) failed to coordinate: ${failures.map(f => f.label).join(', ')}`);
    process.exitCode = 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });

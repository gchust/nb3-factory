// Progress is observational only: no raw logs, prompts, screenshots or model calls.
// The sender has the existing contents permission; only the isolated publisher
// can write comments. A failed notification never changes the build result.
import { lstatSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { acceptanceCriteria, identifyCheck } from './acceptance-criteria.mjs';
import { taskOutcome, outcomeLabels } from './task-outcome.mjs';

export const marker = '<!-- factory-live-progress:v1 -->';
const dataMarker = '<!-- factory-live-progress-data ';
const phases = {
  implementation: '初始实现', verify: '代码检查 / 构建', repair: '应用修复',
  'qa-focused': '失败项定向复测', 'qa-full': '完整业务验收',
  done: '业务验收结束，等待独立终验与发布',
};
const outcomes = ['running', 'passed', 'failed', 'blocked', 'handoff'];
const statuses = ['passed', 'failed', 'blocked', 'not_run'];
const count = (n) => Number.isSafeInteger(n) && n >= 0;
const positive = (n) => count(n) && n > 0;
const id = (s) => typeof s === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(s);
const iso = (t) => t == null ? '未记录' : new Date(t).toISOString();
const minutes = (ms) => `${Math.max(0, Math.floor(ms / 60_000))} 分钟`;

function readJson(file, limit = 1_048_576) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.size > limit) throw new Error('Invalid progress input file');
  return JSON.parse(readFileSync(file, 'utf8'));
}
function optionalJson(file) {
  try { return readJson(file); } catch { return null; } // Concurrent/partial writes are retried on the next sample.
}

export function snapshot(root, metadata, identity, now = Date.now()) {
  const p = readJson(path.join(root, 'progress.json'));
  const result = { version: 1, ...identity, sampledAt: now, phase: p.phase, outcome: p.outcome,
    phaseStartedAt: p.phaseStartedAt ?? now,
    verificationAttempts: p.verificationAttempts, repairAttempts: p.repairAttempts,
    pendingCriteria: p.pendingCriteria, activityAt: null, qa: null };
  // Stat only transcripts and verification output; never read/tokenize large logs
  // or treat our own heartbeat/application background logs as agent activity.
  const round = `verify-${p.verificationAttempts}`;
  for (const relative of ['', round, `${round}/browser-focused`, `${round}/browser-acceptance`]) {
    const dir = path.join(root, relative);
    try {
      if (!lstatSync(dir).isDirectory()) continue;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !/^(?:agent-.*\.jsonl|verify-\d+\.log)$/u.test(entry.name)) continue;
        const stat = lstatSync(path.join(dir, entry.name));
        if (stat.isFile() && stat.size > 0)
          result.activityAt = Math.max(result.activityAt ?? 0, Math.floor(stat.mtimeMs));
      }
    } catch { /* A round's directory may not have been created yet. */ }
  }
  if (p.phase === 'qa-full' || p.phase === 'qa-focused') {
    const scope = p.phase === 'qa-focused' ? 'focused' : 'full';
    const criteria = acceptanceCriteria({ ...metadata.task, qaScope: scope, qaCriteriaIds: p.pendingCriteria });
    const report = optionalJson(path.join(root, round, `browser-${scope === 'full' ? 'acceptance' : 'focused'}`, 'report.json'));
    const checks = new Map();
    let lastCheck = null;
    for (const check of report?.checks ?? []) {
      const criterion = identifyCheck(check, criteria);
      if (!statuses.includes(check.status) || checks.has(criterion.id)) throw new Error('Invalid progress check');
      checks.set(criterion.id, check.status);
      if (positive(check.recordedAt) && check.recordedAt <= now && (!lastCheck || check.recordedAt > lastCheck.at))
        lastCheck = { id: criterion.id, at: check.recordedAt };
    }
    if (Array.isArray(report?.checks)) result.qa = { scope, total: criteria.length, recorded: checks.size,
      ...Object.fromEntries(statuses.map((s) => [s, [...checks.values()].filter((v) => v === s).length])), lastCheck };
  }
  return validateSnapshot(result, now);
}

// Allowlist both sides of the dispatch boundary; arbitrary report text cannot
// become a public comment or a workflow instruction.
export function validateSnapshot(value, now = Date.now()) {
  const time = (t) => positive(t) && t <= now + 60_000;
  if (!value || value.version !== 1 || ![value.issue, value.runId, value.attempt].every(positive) ||
      !time(value.sampledAt) || !time(value.phaseStartedAt) || value.phaseStartedAt > value.sampledAt ||
      !Object.hasOwn(phases, value.phase) || !outcomes.includes(value.outcome) ||
      ![value.verificationAttempts, value.repairAttempts].every(count) ||
      !Array.isArray(value.pendingCriteria) || value.pendingCriteria.length > 128 ||
      value.pendingCriteria.some((v) => !id(v)) || (value.activityAt !== null && !time(value.activityAt)))
    throw new Error('Invalid live progress snapshot');
  let qa = null;
  if (value.qa != null) {
    const q = value.qa;
    if (!['full', 'focused'].includes(q.scope) || ![q.total, q.recorded, ...statuses.map((s) => q[s])].every(count) ||
        q.recorded > q.total || statuses.reduce((n, s) => n + q[s], 0) !== q.recorded ||
        (q.lastCheck !== null && (!id(q.lastCheck?.id) || !time(q.lastCheck?.at))))
      throw new Error('Invalid live QA progress');
    qa = { scope: q.scope, total: q.total, recorded: q.recorded,
      ...Object.fromEntries(statuses.map((s) => [s, q[s]])),
      lastCheck: q.lastCheck && { id: q.lastCheck.id, at: q.lastCheck.at } };
  }
  return { version: 1, issue: value.issue, runId: value.runId, attempt: value.attempt,
    sampledAt: value.sampledAt, phase: value.phase, outcome: value.outcome,
    phaseStartedAt: value.phaseStartedAt, verificationAttempts: value.verificationAttempts,
    repairAttempts: value.repairAttempts, pendingCriteria: value.pendingCriteria,
    activityAt: value.activityAt, qa };
}

export function shouldSend(previous, next, lastAttempt, now) {
  if (lastAttempt && now - lastAttempt < 60_000) return false;
  const changes = (s) => s && JSON.stringify([s.phase, s.outcome, s.verificationAttempts,
    s.repairAttempts, s.pendingCriteria, s.qa && [s.qa.recorded, ...statuses.map((v) => s.qa[v])]]);
  return !previous || changes(previous) !== changes(next) || now - lastAttempt >= 300_000;
}

function githubApi(repository, token) {
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repository ?? '') || !token) throw new Error('Missing progress API configuration');
  return async (method, route, body) => {
    const response = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repository}${route}`, {
      method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Progress API ${method}: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
}
async function list(api, route, key) {
  const items = [];
  for (let page = 1; ; page++) {
    const result = await api('GET', `${route}?per_page=100&page=${page}`);
    const batch = key ? result[key] : result;
    if (!Array.isArray(batch)) throw new Error('Invalid progress list response');
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}
function savedRecord(comment) {
  if (comment.user?.login !== 'github-actions[bot]' || !comment.body?.startsWith(marker)) return null;
  try { return JSON.parse(comment.body.split(dataMarker)[1].split(' -->')[0]); } catch { return null; }
}
export function isNewer(next, old) {
  if (!old) return true;
  const a = [next.runNumber, next.attempt, Number(next.final), next.sampledAt];
  const b = [old.runNumber, old.attempt, Number(old.final), old.sampledAt];
  for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}

export function renderProgress(record, repository) {
  const s = record.snapshot;
  const q = s?.qa;
  const rows = [
    ['当前状态', record.label], ['快照时间（UTC）', iso(record.sampledAt)],
    ['本次运行已耗时', minutes((record.endedAt ?? record.sampledAt) - record.startedAt)],
    ['最近记录阶段', s ? `${phases[s.phase]}（本阶段 ${minutes(s.sampledAt - s.phaseStartedAt)}）` : '尚无阶段快照'],
    ['累计验证 / 修复轮次', s ? `${s.verificationAttempts} / ${s.repairAttempts}` : '未记录'],
    ['待复测 ID', s?.pendingCriteria.length ? s.pendingCriteria.join(', ') : '无已记录项'],
    ['最近 Agent / 校验输出（UTC）', iso(s?.activityAt)],
  ];
  if (q) {
    rows.push(['当前 QA 已记录', `${q.scope === 'focused' ? '定向' : '全量'}：${q.recorded}/${q.total}；通过 ${q.passed}，失败 ${q.failed}，受阻 ${q.blocked}，未执行 ${q.not_run}，未记录 ${q.total - q.recorded}`]);
  }
  if (!q && ['qa-focused', 'qa-full'].includes(s?.phase))
    rows.push(['当前 QA 已记录', '尚无可读取的验收报告']);
  const last = record.lastCheck;
  if (last) {
    rows.push(['最近验收项记录（UTC）', `${last.id} · 第 ${last.round} 轮 · ${iso(last.at)}`]);
  }
  return `${marker}\n${dataMarker}${JSON.stringify(record)} -->\n## 搭建实时进度\n\n` +
    `[Run ${record.runId} / attempt ${record.attempt}](https://github.com/${repository}/actions/runs/${record.runId}/attempts/${record.attempt})\n\n` +
    `| 指标 | 最近观察 |\n| --- | --- |\n${rows.map(([a, b]) => `| ${a} | ${b} |`).join('\n')}\n\n` +
    '> 快照约每五分钟更新，阶段变化节流合并。日志有输出不等于验收有进展；QA 行是已记录结果，不是最终验收结论。时间停止更新表示快照已过时，不能仅凭此认定搭建卡死。\n';
}

export async function publishProgress(api, repository, { runId, attempt, live }, now = Date.now()) {
  if (![runId, attempt].every(positive)) throw new Error('Invalid source run');
  if (live) live = validateSnapshot(live, now);
  const repo = await api('GET', '');
  const run = await api('GET', `/actions/runs/${runId}`);
  // An old attempt must never be attributed to a newer rerun.
  if (run.run_attempt !== attempt) return false;
  const issue = Number(/^Factory issue #(\d+) build /u.exec(run.display_title ?? run.name)?.[1]);
  if (run.id !== runId || run.run_attempt !== attempt || !positive(issue) || !positive(run.run_number) ||
      run.path !== '.github/workflows/code-agent-task.yml' || run.head_branch !== repo.default_branch ||
      run.head_repository?.full_name !== repository || !['issues', 'repository_dispatch', 'workflow_dispatch'].includes(run.event) ||
      (live && (live.issue !== issue || live.runId !== runId || live.attempt !== attempt)))
    throw new Error('Not the requested factory task');
  const jobs = await list(api, `/actions/runs/${runId}/attempts/${attempt}/jobs`, 'jobs');
  if (!jobs.some((j) => j.name === 'prepare' && j.conclusion === 'success')) return false;
  // Read-only question runs must not replace the last business build's progress.
  if (jobs.some((j) => j.name === 'agent' && j.conclusion === 'skipped')) return false;
  if ((await api('GET', `/issues/${issue}`)).pull_request) throw new Error('Progress target must be an Issue');
  const core = jobs.filter((j) => ['agent', 'verify-final', 'publish'].includes(j.name));
  const dispatched = core.some((j) => j.name === 'agent' && j.status === 'completed' &&
    j.steps?.some((s) => s.name === 'Dispatch continuation run' && s.conclusion === 'success'));
  const outcome = taskOutcome(run, jobs) ||
    core.find((j) => ['failure', 'cancelled', 'timed_out'].includes(j.conclusion))?.conclusion ||
    (dispatched ? 'handoff' : null);
  // A comment-reply job may still be running after delivery; do not occupy a
  // reporter runner waiting for it or confuse it with business build progress.
  const completed = Boolean(outcome);
  const comments = await list(api, `/issues/${issue}/comments`);
  const existing = comments.find((c) => savedRecord(c));
  const prior = existing && savedRecord(existing);
  if (prior?.runId === runId && prior.attempt === attempt && prior.snapshot &&
      (!live || (completed && prior.snapshot.sampledAt > live.sampledAt)))
    live = validateSnapshot(prior.snapshot, now);
  const activeJob = jobs.find((j) => ['verify-final', 'publish'].includes(j.name) && j.status === 'in_progress');
  const label = completed ? (outcomeLabels[outcome] ?? '运行已结束，结果未确认')
    : activeJob ? (activeJob.name === 'verify-final' ? '独立终验进行中' : '发布业务 PR 进行中')
    : live?.outcome === 'handoff' ? '检查点已记录，续跑派发待确认'
    : live?.outcome === 'blocked' ? '阶段受阻，等待本 Run 收尾'
    : live?.outcome === 'failed' ? '阶段失败，等待本 Run 收尾'
    : live ? phases[live.phase] : '运行中，尚无阶段快照';
  const record = { runId, attempt, runNumber: run.run_number, final: completed,
    sampledAt: completed || !live ? now : live.sampledAt, startedAt: Date.parse(run.run_started_at),
    endedAt: completed ? Math.max(...core.map((j) => Date.parse(j.completed_at)).filter(Number.isFinite), Date.parse(run.updated_at)) : null,
    lastCheck: live?.qa?.lastCheck ? { ...live.qa.lastCheck, round: live.verificationAttempts }
      : prior?.runId === runId && prior.attempt === attempt ? prior.lastCheck ?? null : null,
    label, snapshot: live ?? null };
  if (!Number.isFinite(record.startedAt) || (record.endedAt !== null && !Number.isFinite(record.endedAt))) throw new Error('Invalid source start time');
  // Completed deliveries are immutable to late live events; replay is idempotent.
  if (prior?.final && prior.runId === runId && prior.attempt === attempt) return false;
  if (!isNewer(record, prior)) return false;
  const body = renderProgress(record, repository);
  await api(existing ? 'PATCH' : 'POST', existing ? `/issues/comments/${existing.id}` : `/issues/${issue}/comments`, { body });
  return true;
}

async function watch(root, metadataFile, api) {
  const metadata = readJson(metadataFile);
  const identity = { issue: metadata.issue.number, runId: Number(process.env.GITHUB_RUN_ID), attempt: Number(process.env.GITHUB_RUN_ATTEMPT) };
  const controller = new AbortController();
  let stopping = false, previous, lastAttempt = 0;
  const stop = () => { stopping = true; controller.abort(); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  writeFileSync(path.join(root, 'live-progress.pid'), String(process.pid));
  const send = async (force = false) => {
    try {
      const current = snapshot(root, metadata, identity);
      if (!force && !shouldSend(previous, current, lastAttempt, Date.now())) return;
      lastAttempt = Date.now();
      await api('POST', '/dispatches', { event_type: 'factory-progress', client_payload: { snapshot: current } });
      previous = current;
    } catch (error) { console.warn(`Progress notification unavailable: ${error.message}`); }
  };
  try {
    while (!stopping) {
      await send();
      if (!stopping) await sleep(10_000, undefined, { signal: controller.signal }).catch(() => {});
    }
    await send(true);
  } finally { writeFileSync(path.join(root, 'live-progress.stopped'), 'stopped'); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, root, metadata] = process.argv.slice(2);
  // Even startup/stop failures are non-blocking to the business pipeline.
  try {
    if (mode === 'stop') {
      const pidFile = path.join(root, 'live-progress.pid');
      if (existsSync(pidFile)) {
        const pid = Number(readFileSync(pidFile, 'utf8'));
        if (!positive(pid)) throw new Error('Invalid progress observer PID');
        try { process.kill(pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
        for (let i = 0; i < 12 && !existsSync(path.join(root, 'live-progress.stopped')); i++) await sleep(1_000);
      }
    } else {
      const repository = process.env.GITHUB_REPOSITORY;
      const api = githubApi(repository, process.env.GITHUB_TOKEN);
      if (mode === 'watch') await watch(root, metadata, api);
      else if (mode === 'publish') {
        const event = readJson(process.env.GITHUB_EVENT_PATH);
        const live = event.client_payload?.snapshot;
        await publishProgress(api, repository, {
          runId: Number(live?.runId ?? event.workflow_run?.id ?? event.inputs?.run_id),
          attempt: Number(live?.attempt ?? event.workflow_run?.run_attempt ?? event.inputs?.attempt), live,
        });
      } else throw new Error('Usage: task-progress.mjs watch ROOT METADATA | stop ROOT | publish');
    }
  } catch (error) {
    console.warn(`::warning::Live progress unavailable: ${error.message}`);
    if (mode === 'publish') process.exitCode = 1; // Report workflow fails visibly, never the source build.
  }
}

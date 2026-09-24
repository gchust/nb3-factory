import { readResult } from './agent-result.mjs';
import { taskOutcome, outcomeLabels } from './task-outcome.mjs';
import { createHash } from 'node:crypto';
import { createReadStream, lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

export const phases = [
  'implementation',
  'repair',
  'qa',
  'qaFocused',
  'qaReport',
  'review',
  'compaction',
];
const tokenKeys = [
  'input',
  'output',
  'cacheRead',
  'cacheWrite',
  'reasoning',
  'totalTokens',
];
const jobNames = new Set(['prepare', 'agent', 'verify-final', 'publish']);
const count = (value) => Number.isSafeInteger(value) && value >= 0;
export const positive = (value) => count(value) && value > 0;
const emptyTokens = () => Object.fromEntries(tokenKeys.map((key) => [key, 0]));
export const emptyUsage = () => ({
  phases: Object.fromEntries(phases.map((phase) => [phase, emptyTokens()])),
  records: 0,
  missing: 0,
  incomplete: 0,
});

// Pi's normalized input excludes cache reads/writes, and so does CodeBuddy's:
// both report cache reads and writes as separate categories. Reasoning is a
// subset of output, never an additional term. A zero-filled error is not proof
// of zero cost.
const TERMINAL_EVENTS = new Set(['agent_end', 'agent_settled', 'result']);
// CodeBuddy reports one cumulative usage per invocation with Anthropic-style
// field names and no total, so the four categories below are the only ones that
// may be summed.
const codebuddyUsage = (usage) =>
  usage && {
    input: usage.input_tokens,
    output: usage.output_tokens,
    cacheRead: usage.cache_read_input_tokens,
    cacheWrite: usage.cache_creation_input_tokens,
  };
function addUsage(target, phase, usage) {
  const tokens = target.phases[phase];
  if (
    !usage ||
    !['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens'].some((key) =>
      positive(usage[key]),
    )
  ) {
    target.missing++;
    return;
  }
  target.records++;
  const complete = ['input', 'output', 'cacheRead', 'cacheWrite'].every((key) =>
    count(usage[key]),
  );
  for (const key of tokenKeys) if (count(usage[key])) tokens[key] += usage[key];
  const sum = ['input', 'output', 'cacheRead', 'cacheWrite'].reduce(
    (n, key) => n + (count(usage[key]) ? usage[key] : 0),
    0,
  );
  if (!positive(usage.totalTokens)) tokens.totalTokens += sum;
  if (!complete || (positive(usage.totalTokens) && usage.totalTokens !== sum))
    target.incomplete++;
}

function phaseOf(file) {
  if (file === 'agent-review.jsonl') return 'review';
  if (file === 'agent-implement.jsonl') return 'implementation';
  if (/^agent-repair-[1-9]\d*\.jsonl$/.test(file)) return 'repair';
  const browser =
    /^verify-[1-9]\d*\/browser-(acceptance|focused)\/agent-browser-(acceptance|report-repair-[1-9]\d*)\.jsonl$/.exec(
      file,
    );
  if (browser)
    return browser[2].startsWith('report-repair')
      ? 'qaReport'
      : browser[1] === 'focused'
        ? 'qaFocused'
        : 'qa';
  return null;
}

export async function collectUsage(root) {
  const usage = emptyUsage();
  let logs = 0;
  async function visit(relative = '', depth = 0) {
    const directory = path.join(root, relative);
    if (lstatSync(directory).isSymbolicLink())
      throw new Error('Usage artifacts cannot be symlinks');
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      const phase = phaseOf(name);
      if (entry.isSymbolicLink()) {
        usage.incomplete++;
        continue;
      }
      if (entry.isDirectory() && depth < 2) {
        await visit(name, depth + 1);
        continue;
      }
      if (!phase || !entry.isFile()) continue;
      logs++;
      // New runs are engine-neutral. Keep the legacy parser below solely for
      // previously published Pi/CodeBuddy transcripts without a sidecar.
      let normalized;
      try { normalized = readResult(path.join(root, name)); }
      catch { usage.incomplete++; continue; }
      if (normalized) {
        for (const measurement of normalized.measurements)
          addUsage(usage, measurement.phase ?? phase, measurement.usage);
        if (normalized.status !== 'completed' || normalized.invalidEvents || normalized.incomplete ||
            (normalized.completion !== 'exit' && !normalized.terminalEvent) || !normalized.measurements.length)
          usage.incomplete++;
        continue;
      }
      let settled = false;
      let events = 0;
      let measurements = 0;
      const seen = new Set();
      const input = createReadStream(path.join(root, name));
      const lines = createInterface({ input, crlfDelay: Infinity });
      for await (const line of lines) {
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          if (line.trimStart().startsWith('{')) usage.incomplete++;
          continue; // stderr can share the JSONL file; never echo it to the Issue.
        }
        if (!event || typeof event !== 'object') continue;
        events++;
        if (
          [
            'agent_start',
            'turn_start',
            'message_start',
            'compaction_start',
            'auto_retry_start',
          ].includes(event.type)
        )
          settled = false;
        if (TERMINAL_EVENTS.has(event.type)) settled = event.willRetry !== true;
        // Do not count message_start/update, turn_end, agent_end or result
        // snapshots. CodeBuddy emits its usage once, on the cumulative result
        // event; its assistant messages must not be counted a second time.
        const assistant =
          event.type === 'message_end' && event.message?.role === 'assistant';
        const compaction = event.type === 'compaction_end';
        const result = event.type === 'result';
        if (!assistant && !compaction && !result) continue;
        measurements++;
        const fingerprint = createHash('sha256').update(line).digest('hex');
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint); // responseId alone is not unique for some proxies.
        addUsage(
          usage,
          compaction ? 'compaction' : phase,
          compaction
            ? event.result?.usage
            : result
              ? codebuddyUsage(event.usage)
              : event.message.usage,
        );
      }
      if (!settled || !events || !measurements) usage.incomplete++;
    }
  }
  try {
    await visit();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    usage.incomplete++;
  }
  if (!logs) usage.incomplete++;
  return usage;
}

export function selectSource(run, jobs, artifacts, repository) {
  if (
    !positive(run.id) ||
    !positive(run.run_attempt) ||
    run.status !== 'completed' ||
    run.path !== '.github/workflows/code-agent-task.yml' ||
    run.head_repository?.full_name !== repository ||
    !['issues', 'repository_dispatch', 'workflow_dispatch'].includes(run.event)
  )
    throw new Error('Not a completed same-repository task run');
  const issueIds = [
    ...new Set(
      artifacts
        .map(
          (a) =>
            /^factory-(?:agent|task|handoff)-([1-9]\d*)$/.exec(a.name)?.[1],
        )
        .filter(Boolean),
    ),
  ];
  if (!issueIds.length) return null; // Rejected/blocked Issues did not start building.
  if (issueIds.length !== 1) throw new Error('Ambiguous task artifacts');
  const issue = Number(issueIds[0]);
  if (!positive(issue)) throw new Error('Invalid Issue number');
  const builds = jobs.filter(
    (job) => jobNames.has(job.name) && job.conclusion !== 'skipped',
  );
  const agent = builds.find((job) => job.name === 'agent');
  const normalized = builds.map((job) => {
    const start = Date.parse(job.started_at);
    const end = Date.parse(job.completed_at);
    return {
      id: job.id,
      name: job.name,
      seconds:
        Number.isFinite(start) && end >= start
          ? Math.round((end - start) / 1000)
          : null,
    };
  });
  const artifactsForAgent = agent
    ? artifacts.filter(
        (a) =>
          a.name === `factory-agent-${issue}` &&
          !a.expired &&
          Date.parse(a.created_at) >= Date.parse(agent.started_at) &&
          Date.parse(a.created_at) <= Date.parse(agent.completed_at),
      )
    : [];
  if (artifactsForAgent.length > 1) throw new Error('Ambiguous Agent artifact');
  const invoked =
    agent?.steps?.some(
      (step) =>
        [
          'Run Code Agent implementation',
          'Verify and repair until successful',
        ].includes(step.name) &&
        step.started_at &&
        step.conclusion !== 'skipped',
    ) ?? Boolean(agent);
  const finished = builds
    .map((job) => Date.parse(job.completed_at))
    .filter(Number.isFinite);
  const status = taskOutcome(run, jobs);
  return {
    version: 1,
    repository,
    issue,
    runId: run.id,
    attempt: run.run_attempt,
    status,
    start: Date.parse(
      run.run_attempt === 1 ? run.created_at : run.run_started_at,
    ),
    end: finished.length ? Math.max(...finished) : Date.parse(run.updated_at),
    jobs: normalized,
    agentJobId: agent?.id ?? null,
    invoked,
    artifact: artifactsForAgent[0]?.name ?? null,
    artifactId: artifactsForAgent[0]?.id ?? null,
  };
}

export function validateRecord(record, repository, issue) {
  if (
    record?.version !== 1 ||
    record.repository !== repository ||
    record.issue !== issue ||
    !positive(record.runId) ||
    !positive(record.attempt) ||
    !count(record.start) ||
    !count(record.end) ||
    record.end < record.start ||
    !Array.isArray(record.jobs) ||
    record.jobs.length > 10 ||
    !record.jobs.every(
      (job) =>
        positive(job.id) &&
        jobNames.has(job.name) &&
        (job.seconds === null || count(job.seconds)),
    )
  )
    throw new Error('Invalid usage record');
  if (
    record.agentJobId !== null &&
    !record.jobs.some(
      (job) => job.id === record.agentJobId && job.name === 'agent',
    )
  )
    throw new Error('Invalid Agent job');
  const usage = record.usage;
  // Historical receipts predate the independent reviewer. Missing is not a new invocation.
  if (usage?.phases && !Object.hasOwn(usage.phases, 'review')) usage.phases.review = emptyTokens();
  if (
    usage?.phases &&
    !('qaReport' in usage.phases) &&
    !('qaFocused' in usage.phases)
  ) {
    usage.phases.qaFocused = emptyTokens();
    usage.phases.qaReport = emptyTokens();
    usage.legacyQa = true;
  }
  if (
    !usage ||
    !['records', 'missing', 'incomplete'].every((key) => count(usage[key])) ||
    !phases.every((phase) =>
      tokenKeys.every((key) => count(usage.phases?.[phase]?.[key])),
    )
  )
    throw new Error('Invalid token counters');
  return record;
}

export function recordsFromComments(comments, repository, issue) {
  return comments
    .filter((comment) => comment.user?.login === 'github-actions[bot]')
    .flatMap((comment) => {
      const match = /<!-- factory-task-usage-data\n([^\n]+)\n-->/.exec(
        comment.body ?? '',
      );
      if (!match) return [];
      const record = validateRecord(JSON.parse(match[1]), repository, issue);
      if (!comment.body.includes(marker(record)))
        throw new Error('Usage comment identity mismatch');
      return [record];
    });
}
export const marker = (record) =>
  `<!-- factory-task-usage:${record.runId}:${record.attempt} -->`;

export function aggregate(records) {
  const runs = new Map();
  const jobs = new Map();
  const agents = new Map();
  for (const record of records) {
    runs.set(`${record.runId}:${record.attempt}`, record);
    for (const job of record.jobs) jobs.set(job.id, job);
    if (record.agentJobId !== null) {
      const old = agents.get(record.agentJobId);
      // Downstream-only reruns reuse the original Agent job. Never add its usage
      // twice, nor replace already recovered counters with an expired artifact.
      if (!old || record.usage.records >= old.records)
        agents.set(record.agentJobId, record.usage);
    }
  }
  const usage = emptyUsage();
  for (const item of agents.values()) {
    for (const phase of phases)
      for (const key of tokenKeys)
        usage.phases[phase][key] += (item.phases[phase]?.[key] ?? 0);
    for (const key of ['records', 'missing', 'incomplete'])
      usage[key] += item[key];
  }
  return {
    usage,
    total: phases.reduce((n, phase) => n + usage.phases[phase].totalTokens, 0),
    seconds: [...jobs.values()].reduce((n, job) => n + (job.seconds ?? 0), 0),
    missingTimes: [...jobs.values()].filter((job) => job.seconds === null)
      .length,
    elapsed: Math.round(
      (Math.max(...[...runs.values()].map((r) => r.end)) -
        Math.min(...[...runs.values()].map((r) => r.start))) /
        1000,
    ),
    runs: new Set([...runs.values()].map((r) => r.runId)).size,
    attempts: runs.size,
  };
}

export function renderUsage(record, records) {
  const current = aggregate([record]);
  const cumulative = aggregate(records);
  const number = (value) => value.toLocaleString('en-US');
  const duration = (value) =>
    `${Math.floor(value / 3600)} 小时 ${Math.floor(value / 60) % 60} 分 ${value % 60} 秒`;
  const tokens = (value) =>
    !value.total && (value.usage.missing || value.usage.incomplete)
      ? '未知（未取得可用 usage）'
      : `${number(value.total)}${value.usage.missing || value.usage.incomplete ? '（已记录，可能不完整）' : ''}`;
  const headlineTokens = (key) =>
    cumulative.usage.records
      ? number(phases.reduce((n, p) => n + cumulative.usage.phases[p][key], 0))
      : '未知';
  const coverage =
    cumulative.usage.missing || cumulative.usage.incomplete
      ? '（用量不完整，仅为已采集值）'
      : '';
  const statuses = outcomeLabels;
  const names = {
    implementation: '初始实现',
    repair: '应用修复',
    qa: '完整业务 QA（旧记录含报告修复）',
    qaFocused: '失败路径复测',
    qaReport: 'QA 补报告',
    review: '独立搭建评审',
    compaction: '上下文压缩',
  };
  const url = `https://github.com/${record.repository}/actions/runs/${record.runId}/attempts/${record.attempt}`;
  return [
    marker(record),
    '## 搭建 Token 与耗时',
    '',
    `本轮状态：**${statuses[record.status] || '未完成'}** · [Run ${record.runId} / attempt ${record.attempt}](${url})`,
    '',
    `已采集：非缓存输入 **${headlineTokens('input')}** · 输出（含思考） **${headlineTokens('output')}** · 执行时间 **${duration(cumulative.seconds)}**${coverage}。`,
    '',
    '<details><summary>本轮、累计 Token 与统计口径</summary>',
    '',
    '| 指标 | 本轮 Run attempt | 此 Issue 累计（已采集） |',
    '| --- | ---: | ---: |',
    `| 已记录总 Token（含缓存） | ${tokens(current)} | ${tokens(cumulative)} |`,
    `| 搭建执行时间（不含排队） | ${duration(current.seconds)} | ${duration(cumulative.seconds)} |`,
    `| 端到端时间（含排队及续跑/重试间隔） | ${duration(current.elapsed)} | ${duration(cumulative.elapsed)} |`,
    '',
    `累计覆盖 ${cumulative.runs} 个 Run、${cumulative.attempts} 次运行尝试；同一 Agent job 被下游重跑复用时只计一次。`,
    '',
    '### Token 分项（Issue 累计）',
    '',
    '| 阶段 | 非缓存输入 | 输出（含思考） | 缓存读取 | 缓存写入 | 合计 |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...phases.map((phase) => {
      const t = cumulative.usage.phases[phase];
      return `| ${names[phase]} | ${[t.input, t.output, t.cacheRead, t.cacheWrite, t.totalTokens].map(number).join(' | ')} |`;
    }),
    '',
    `用量记录：${number(cumulative.usage.records)}；未报告用量记录：${number(cumulative.usage.missing)}；日志/分项不完整标记：${number(cumulative.usage.incomplete)}；缺失作业时间：${cumulative.missingTimes}。`,
    '',
    '> Token 来自 Agent 日志中的 API usage（包含失败修复轮次和已报告的上下文压缩）；不把流式增量、历史快照、上下文长度或思考 token 重复相加。零填充响应、被中断请求或未报告的内部调用可能有遗漏，不等同于供应商账单，也不推算费用。',
    '> 执行时间累计 prepare、agent（含验收）、verify-final、publish 的唯一作业时长，不含媒体发布与统计工作流。端到端时间从已采集首轮启动计算，包含等待间隔；早于功能启用且未补采集的运行不在累计内。',
    '',
    '</details>',
    '',
    `<!-- factory-task-usage-data\n${JSON.stringify(record)}\n-->`,
  ].join('\n');
}

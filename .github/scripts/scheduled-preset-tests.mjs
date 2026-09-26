import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { BUILD_LABEL } from './factory-lib.mjs';
import { getPresetSourceNumber, isManualIssue, isPresetIssue } from './issue-presets.mjs';
import { stripTaskTitle } from './task-compat.mjs';
import { SAMPLE_LABEL } from './evaluation-sample.mjs';

export const DAILY_PRESET_LABEL = 'factory:daily';
const WORKFLOW = 'code-agent-task.yml';
const ACTIVE_LABELS = new Set([
  'agent:pending', 'agent:queued', 'agent:running', 'agent:verifying', 'agent:waiting',
]);
const labelNames = (issue) => (issue.labels ?? []).map((label) => label.name ?? label);
const isFactoryAuthored = (item) => item.user?.login === 'github-actions[bot]' && item.user.type === 'Bot';

async function listAll(client, route, query = {}) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const batch = await client.request('GET', route, { query: { ...query, per_page: 100, page } });
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

function validatePreset(issue) {
  const labels = labelNames(issue);
  if (issue.pull_request || !labels.includes('factory:preset') || !labels.includes(DAILY_PRESET_LABEL) ||
      labels.includes('factory:manual') || !issue.user?.login || issue.user.type === 'Bot' ||
      /\[bot\]$/i.test(issue.user.login)) {
    throw new Error(`#${issue.number} 必须是同时带 factory:preset 和 ${DAILY_PRESET_LABEL} 标签的人工案例，不能是 PR 或 factory:manual 任务。`);
  }
}

export async function initializeDailyLabel(client) {
  const name = DAILY_PRESET_LABEL;
  const description = 'Select this factory:preset for the legacy manual launcher; daily batches use plans.json';
  const route = `/labels/${encodeURIComponent(name)}`;
  if (await client.request('GET', route, { allow404: true })) return;
  try {
    await client.request('POST', '/labels', {
      body: { name, color: 'bfdadc', description },
    });
  } catch (error) {
    // Another actor may have created it between the read and write.
    if (!await client.request('GET', route, { allow404: true })) throw error;
  }
}

function groupByPreset(issues, repositoryUrl) {
  const groups = new Map();
  for (const issue of issues) {
    // Evaluation-batch samples copy the same preset body but have their own serial scheduler.
    if (issue.pull_request || isPresetIssue(issue) || isManualIssue(issue) || labelNames(issue).includes(SAMPLE_LABEL)) continue;
    let number;
    try {
      number = getPresetSourceNumber(issue.body ?? '', repositoryUrl);
    } catch (error) {
      throw new Error(`执行 Issue #${issue.number} 的预置来源无效：${error.message}`);
    }
    if (number == null) continue;
    const group = groups.get(number) ?? [];
    group.push(issue);
    groups.set(number, group);
  }
  return groups;
}

async function findPrevious(client, candidates, marker) {
  for (const issue of candidates) {
    const comments = await listAll(client, `/issues/${issue.number}/comments`);
    const receipt = comments.find((comment) => isFactoryAuthored(comment) && comment.body?.includes(marker));
    // The prepare phase replaces the Issue body. The bot receipt survives it.
    if (issue.body?.includes(marker) || receipt) return { issue, receipt };
  }
  return {};
}

async function hasTaskRun(client, issueNumber, since) {
  for (let page = 1; ; page += 1) {
    const { workflow_runs: runs } = await client.request('GET', `/actions/workflows/${WORKFLOW}/runs`, {
      query: { event: 'workflow_dispatch', created: `>=${since}`, per_page: 100, page },
    });
    if (runs.some((run) => run.display_title?.startsWith(`Factory issue #${issueNumber} build `))) return true;
    if (runs.length < 100) return false;
  }
}

export async function runPresetTests({ client, runId, dryRun = false, serverUrl = 'https://github.com' }) {
  // Labels are the only selection source. Include closed presets, not just open Issues.
  const candidates = await listAll(client, '/issues', {
    state: 'all', labels: `factory:preset,${DAILY_PRESET_LABEL}`, sort: 'created', direction: 'asc',
  });
  const sources = [...new Map(candidates.map((issue) => [issue.number, issue])).values()]
    .sort((a, b) => a.number - b.number);
  const result = { branch: '', repositoryUrl: `${serverUrl}/${client.repository}`, dryRun, rows: [] };
  if (!sources.length) return result;
  if (!/^[1-9]\d*$/.test(String(runId))) throw new Error('GITHUB_RUN_ID is required.');
  result.branch = (await client.getRepository()).default_branch;
  const { created_at: since } = await client.request('GET', `/actions/runs/${runId}`);
  if (!since || !Number.isFinite(Date.parse(since))) throw new Error('无法读取调度运行的创建时间。');
  const runUrl = `${serverUrl}/${client.repository}/actions/runs/${runId}`;

  // Scan each candidate set once for the whole batch; no per-preset label or
  // search index. Old active tasks matter, even if untouched since before this run.
  const activeByPreset = groupByPreset((await listAll(client, '/issues', { state: 'open' }))
    .filter((issue) => labelNames(issue).some((name) => ACTIVE_LABELS.has(name))), result.repositoryUrl);
  // created_at is the original launch time, not the current retry's start time.
  const previousByPreset = groupByPreset((await listAll(client, '/issues', { state: 'all', since }))
    .filter(isFactoryAuthored), result.repositoryUrl);

  for (const source of sources) {
    const row = { preset: source.number, title: source.title, status: '', issue: null, message: '' };
    result.rows.push(row);
    try {
      // A mislabelled PR/bot/manual task must not build or suppress other daily cases.
      validatePreset(source);
      const marker = `<!-- factory-preset-test:${runId}:${source.number} -->`;
      const sentMarker = `<!-- factory-preset-test-dispatched:${runId}:${source.number} -->`;
      let { issue, receipt } = await findPrevious(client, previousByPreset.get(source.number) ?? [], marker);
      row.issue = issue?.number ?? null;
      if (issue && (issue.state !== 'open' || receipt?.body?.includes(sentMarker) ||
          await hasTaskRun(client, issue.number, since))) {
        row.status = 'already-submitted';
        row.message = '本轮已有任务；不重复创建或派发。';
        continue;
      }
      const active = (activeByPreset.get(source.number) ?? [])
        .find((task) => task.number !== issue?.number);
      if (active) {
        row.issue = active.number;
        row.status = 'skipped-active';
        row.message = '该案例上一轮仍在排队或执行；跳过，避免堆积。';
        continue;
      }
      if (dryRun) {
        row.status = 'planned';
        row.message = issue ? '将复用本轮 Issue 并派发。' : '将创建独立 Issue 并派发。';
        continue;
      }
      if (!issue) {
        await client.ensureStatusLabels();
        issue = await client.request('POST', '/issues', {
          body: {
            title: (stripTaskTitle(source.title) || '从预置案例重新搭建').slice(0, 250),
            // Feed the existing preset prepare protocol, not copied business code.
            body: `${marker}\n\n### 预置案例\n\n#${source.number}\n`,
            labels: [BUILD_LABEL, 'agent:pending'],
          },
        });
        row.issue = issue.number;
      }
      if (!receipt) {
        receipt = await client.addComment(issue.number,
          `${marker}\n\n每日预设搭建测试：案例 #${source.number}（${DAILY_PRESET_LABEL}）。\n\n` +
          `调度记录：[本轮 Action](${runUrl})。创建独立任务；不修改来源案例，不自动合并测试 PR。`);
      }
      // GITHUB_TOKEN-created Issues do not emit an issues workflow run.
      await client.request('POST', `/actions/workflows/${WORKFLOW}/dispatches`, {
        body: { ref: result.branch, inputs: { issue_number: String(issue.number) } },
      });
      row.status = 'dispatched';
      row.message = '已派发；搭建、QA、PR 和报告由原工作流负责。';
      await client.request('PATCH', `/issues/comments/${receipt.id}`, {
        body: { body: `${receipt.body}\n\n${sentMarker}\n已派发到搭建工作流；这不表示验收已通过。` },
      });
    } catch (error) {
      row.message = `${row.status === 'dispatched' ? '已派发，但回执保存失败：' : ''}${error.message}`;
      row.status = 'error';
      // Preserve partial results and attempt the other daily presets.
    }
  }
  return result;
}

const cell = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/[\r\n]+/g, ' ');

export function renderSummary(result) {
  const heading = '# 每日预设搭建测试调度\n\n';
  if (!result.rows.length) {
    return `${heading}没有同时带 \`factory:preset\` 和 \`${DAILY_PRESET_LABEL}\` 标签的案例，没有创建 Issue 或调用 Agent。\n`;
  }
  const issueLink = (number) => result.repositoryUrl ? `[#${number}](${result.repositoryUrl}/issues/${number})` : `#${number}`;
  return `${heading}${result.dryRun ? '**只预览：没有写入或派发。**\n\n' : ''}` +
    `名单来自预设 Issue 上的 \`${DAILY_PRESET_LABEL}\` 标签，每轮重新读取。\n\n` +
    `搭建入口：默认分支 \`${cell(result.branch)}\`。最终验收结果请查看各执行 Issue 的 PR 和报告。\n\n` +
    '| 预设 | 名称 | 调度状态 | 执行 Issue | 说明 |\n| --- | --- | --- | --- | --- |\n' +
    result.rows.map((row) => `| ${issueLink(row.preset)} | ${cell(row.title)} | ${row.status} | ` +
      `${row.issue ? issueLink(row.issue) : '—'} | ${cell(row.message)} |`).join('\n') + '\n';
}

async function main() {
  // Keep the orchestration importable for no-network tests; reuse the existing API client in production.
  const { GitHubClient } = await import('./factory-lib.mjs');
  const client = new GitHubClient({
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
    apiUrl: process.env.GITHUB_API_URL,
  });
  if (process.argv[2] === '--init-label') {
    await initializeDailyLabel(client);
    console.log(`${DAILY_PRESET_LABEL} 标签已就绪；没有创建搭建任务。`);
    return;
  }
  const result = await runPresetTests({
    client, runId: process.env.GITHUB_RUN_ID,
    dryRun: process.env.DRY_RUN === 'true', serverUrl: process.env.GITHUB_SERVER_URL,
  });
  const summary = renderSummary(result);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  if (result.rows.some((row) => row.status === 'error')) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `# 每日预设搭建测试调度失败\n\n${cell(error.message)}\n`);
    }
    process.exitCode = 1;
  });
}

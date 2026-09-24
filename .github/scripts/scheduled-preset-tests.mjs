import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DAILY_PRESET_LABEL = 'factory:daily';
const WORKFLOW = 'code-agent-task.yml';
const ACTIVE_LABELS = new Set([
  'agent:pending', 'agent:queued', 'agent:running', 'agent:verifying', 'agent:waiting',
]);
const labelNames = (issue) => (issue.labels ?? []).map((label) => label.name ?? label);
const isFactoryComment = (comment) => comment.user?.login === 'github-actions[bot]';

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

async function ensureLabel(client, name, description = 'Independent build tests from this preset; not a source preset') {
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

export async function initializeDailyLabel(client) {
  await ensureLabel(client, DAILY_PRESET_LABEL, 'Run this factory:preset automatically every day; remove to stop future runs');
}

async function findPrevious(client, label, since, marker) {
  const candidates = await listAll(client, '/issues', { state: 'all', labels: label, since });
  for (const issue of candidates.filter((item) => !item.pull_request)) {
    const comments = await listAll(client, `/issues/${issue.number}/comments`);
    const receipt = comments.find((comment) => isFactoryComment(comment) && comment.body?.includes(marker));
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

  for (const source of sources) {
    const row = { preset: source.number, title: source.title, status: '', issue: null, message: '' };
    result.rows.push(row);
    try {
      // A mislabelled PR/bot/manual task must not build or suppress other daily cases.
      validatePreset(source);
      const label = `factory:test-preset-${source.number}`;
      const marker = `<!-- factory-preset-test:${runId}:${source.number} -->`;
      const sentMarker = `<!-- factory-preset-test-dispatched:${runId}:${source.number} -->`;
      let { issue, receipt } = await findPrevious(client, label, since, marker);
      row.issue = issue?.number ?? null;
      if (issue && (issue.state !== 'open' || receipt?.body?.includes(sentMarker) ||
          await hasTaskRun(client, issue.number, since))) {
        row.status = 'already-submitted';
        row.message = '本轮已有任务；不重复创建或派发。';
        continue;
      }
      const active = (await listAll(client, '/issues', { state: 'open', labels: label }))
        .find((task) => !task.pull_request && task.number !== issue?.number &&
          labelNames(task).some((name) => ACTIVE_LABELS.has(name)));
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
        await ensureLabel(client, label);
        await client.ensureStatusLabels();
        issue = await client.request('POST', '/issues', {
          body: {
            title: `[Code Agent] 每日预设搭建测试 #${source.number}`,
            // Feed the existing preset prepare protocol, not copied business code.
            body: `${marker}\n\n### 预置案例\n\n#${source.number}\n`,
            labels: [label, 'agent:pending'],
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

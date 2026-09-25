import { GitHubClient } from './factory-lib.mjs';
import { collectAgentFailure } from './agent-failure.mjs';
import { readJson } from './visual-report.mjs';

const issueNumber = Number(process.argv[2]);
if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
  throw new Error('Usage: mark-failure.mjs <issue-number>');
}

const repository = process.env.GITHUB_REPOSITORY;
const client = new GitHubClient({
  token: process.env.GITHUB_TOKEN,
  repository,
  apiUrl: process.env.GITHUB_API_URL,
});
const issue = await client.getIssue(issueNumber);
const runUrl = `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;

const root = process.argv[3];
let failure;
let state;
let metadata;
if (root) {
  try {
    failure = collectAgentFailure(root);
    state = readJson(root, 'pipeline-state.json');
    metadata = readJson(root, 'task-metadata.json');
  } catch (error) {
    // A missing/corrupt diagnostic must not prevent the original failure notice.
    console.warn(`Failure diagnostics unavailable (${error.code || error.name}).`);
  }
}
const recoverable = process.env.FACTORY_CHECKPOINT_AVAILABLE === 'true' &&
  ['failed', 'blocked'].includes(state?.outcome) && state.phase !== 'done';
const exhausted = state?.outcome === 'budget-exhausted';
const body = [
  exhausted ? '**已达到评测计划预算**。已保存补丁、验收记录与用量，不再启动新的修复或自动续跑；这不是业务缺陷结论。'
    : failure ? `**${failure.title}**。${failure.detail}` : '本次搭建未完成，请根据失败步骤检查运行日志。',
  '', `[查看本次运行日志](${runUrl})。`,
  ...(recoverable ? ['', `已保存恢复检查点；服务或配置修复后，在 Code Agent NocoBase Task 的 Run workflow 中填写 issue_number=${issueNumber}、recovery_run_id=${process.env.GITHUB_RUN_ID}，继续已有工作。`,
    ...(metadata?.applicationBase ? [] : ['旧版检查点还需填写 recovery_base_sha（原应用基线提交），不能使用工厂 Run 的 head_sha 代替猜测。'])] : []),
  '', '模型请求重试与业务修复分开统计；恢复后仍须通过独立验收与最终验证。',
].join('\n');
await client.ensureStatusLabels();
await client.setIssueStatus(
  issue,
  'agent:failed',
  body,
);

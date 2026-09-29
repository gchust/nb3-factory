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
    console.warn(
      `Failure diagnostics unavailable (${error.code || error.name}).`,
    );
  }
}
const recoverable =
  process.env.FACTORY_CHECKPOINT_AVAILABLE === 'true' &&
  ['failed', 'blocked'].includes(state?.outcome) &&
  !state.stopReason &&
  state.phase !== 'done';
const exhausted = state?.outcome === 'budget-exhausted';
// A cancelled run still leaves agent:running, so it is marked here too, but
// it must not read like a build failure.
const cancelled = process.env.FACTORY_RUN_CANCELLED === 'true';
const body = [
  cancelled
    ? '**本次运行已取消**，未完成搭建；这不是搭建失败结论。需要继续时请重新发起任务。'
    : exhausted
    ? '**已停止自动修复，待诊断**。' +
      (state.stopReason?.reason || '已达到任务或评测计划预算。') +
      '\n\n已保存补丁、验收记录、修复日志与用量，不再自动修复或续跑；仍发布失败报告，并在有安全代码差异时创建或更新标记 failed 的搭建 PR，尝试预览打包与部署。' +
      '\n\n累计验证 ' +
      state.verificationAttempts +
      ' 轮、修复 ' +
      state.repairAttempts +
      ' 轮。' +
      '\n\n下载本 Run 的 factory-agent-' +
      issueNumber +
      ' Artifact，查看 task-diagnostic.md / task-diagnostic.json 中的失败轮次和证据位置；独立只读归因见 build-review.json。' +
      '\n\n重复失败不能直接证明 NocoBase3 有缺陷；需要区分框架、Skill、模板、应用、工厂和环境，证据不足标记 unknown。诊断后修正原因，再显式发起新任务。'
    : failure
      ? `**${failure.title}**。${failure.detail}`
      : '本次搭建未完成，请根据失败步骤检查运行日志。',
  '',
  `[查看本次运行日志](${runUrl})。`,
  ...(process.env.FACTORY_PREVIEW_BUILD_RESULT === 'failure'
    ? [
        '',
        '已尝试为失败实现打包预览，但未生成可用部署包；失败报告与搭建 PR 仍保留，详情见 preview-build-failed 作业日志。',
      ]
    : []),
  ...(recoverable
    ? [
        '',
        `已保存恢复检查点；服务或配置修复后，在 Code Agent NocoBase Task 的 Run workflow 中填写 issue_number=${issueNumber}、recovery_run_id=${process.env.GITHUB_RUN_ID}，继续已有工作。`,
        ...(metadata?.applicationBase
          ? []
          : [
              '旧版检查点还需填写 recovery_base_sha（原应用基线提交），不能使用工厂 Run 的 head_sha 代替猜测。',
            ]),
      ]
    : []),
  '',
  '模型请求重试与业务修复分开统计；恢复后仍须通过独立验收与最终验证。',
].join('\n');
await client.ensureStatusLabels();
await client.setIssueStatus(issue, 'agent:failed', body);

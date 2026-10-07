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
// A cancelled run still leaves agent:running, so it is marked here too, but
// it must not read like a build failure. FACTORY_RUN_CANCELLED is set only
// when the run itself was cancelled; the agent job reports its own six-hour
// timeout, which GitHub also shows as cancelled.
const timedOut = process.env.FACTORY_RUN_TIMED_OUT === 'true';
const cancelled = process.env.FACTORY_RUN_CANCELLED === 'true' && !timedOut;
// A handoff whose continuation was not dispatched (its checkpoint or dispatch
// step failed) has no successor: its checkpoint is recovered like a failure's
// (validateRecovery checks the source run's jobs and runs again).
const undispatched =
  process.env.FACTORY_HANDOFF_UNDISPATCHED === 'true' &&
  state?.outcome === 'handoff';
// A recovery starts only from a run that concluded as failed, never from one
// that was cancelled.
const recoverable =
  process.env.FACTORY_CHECKPOINT_AVAILABLE === 'true' &&
  (['failed', 'blocked'].includes(state?.outcome) || undispatched) &&
  !state.stopReason &&
  state.phase !== 'done' &&
  !cancelled;
const exhausted = state?.outcome === 'budget-exhausted';
const body = [
  timedOut
    ? '**本次运行超过 GitHub runner 的 6 小时上限被终止**，未完成搭建；这不是搭建失败结论。已尽量保存补丁与检查点，需要继续时请重新发起任务。'
    : cancelled
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
  // GitHub reports a packaging job that hit its timeout as cancelled; a
  // cancelled run cancels that job too, which is not a packaging failure.
  ...(process.env.FACTORY_PREVIEW_BUILD_RESULT === 'failure' ||
  (process.env.FACTORY_PREVIEW_BUILD_RESULT === 'cancelled' &&
    process.env.FACTORY_RUN_CANCELLED !== 'true')
    ? [
        '',
        '已尝试为失败实现打包预览，但未生成可用部署包；失败报告与搭建 PR 仍保留，详情见 preview-build-failed 作业日志。',
      ]
    : []),
  // A rejected GitHub Re-run saved no checkpoint of its own, yet the earlier
  // attempt's checkpoint is intact and recovery accepts it.
  // A failed build whose patch is empty on a new work branch has nothing to
  // publish: say so instead of leaving the missing PR unexplained.
  ...(process.env.FACTORY_EMPTY_PATCH === 'true'
    ? [
        '',
        '本次运行没有保存任何代码差异，工作分支尚不存在，因此没有创建标记 failed 的搭建 PR。',
      ]
    : []),
  // Only a checkpoint that was saved, in a run that was not cancelled, can be
  // recovered; otherwise say plainly that this handoff is lost.
  ...(undispatched && recoverable
    ? [
        '',
        '本次运行已在 5 小时预算处保存 Handoff 检查点，但续跑没有成功派发（若派发请求超时，GitHub 也可能已经收到）。请先在 Actions 中确认没有从本 Run 续跑的运行；恢复时会再次核对，已有续跑时拒绝恢复。',
      ]
    : undispatched
      ? [
          '',
          '本次运行在 5 小时预算处请求了 Handoff，但续跑没有成功派发，且检查点未保存或运行已取消，无法从本 Run 恢复；需要继续时请重新发起任务。',
        ]
      : []),
  ...(process.env.FACTORY_RERUN_REJECTED === 'true'
    ? [
        '',
        `这是对本 Run 的 GitHub Re-run，已在开始前拒绝，本次 attempt 没有保存检查点。若此前的 attempt 保存了检查点，仍可在 Code Agent NocoBase Task 的 Run workflow 中填写 issue_number=${issueNumber}、recovery_run_id=${process.env.GITHUB_RUN_ID} 从中恢复。`,
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

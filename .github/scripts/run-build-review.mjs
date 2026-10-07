import { Buffer } from 'node:buffer';
import { normalizeAgentEnv } from './agent-configuration.mjs';
// One bounded review over a disposable copy of the sealed application, rerun
// on the same copy when a call fails. It cannot change the patch that
// verify-final/publish consume.
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  collectReviewProcess,
  digest,
  readReviewJson,
  rubricVersion,
  safeRelative,
  reviewArtifactHash,
  validateEvaluation,
} from './build-review.mjs';
import {
  assertCapturedInputs,
  finalizeAssessment,
  materializeEvidence,
} from './check-review-draft.mjs';
export {
  finalizeAssessment,
  materializeEvidence,
} from './check-review-draft.mjs';
import { resolveAgent } from './agent-registry.mjs';
import { credentialNames, engineEnv } from './agent-adapter.mjs';
import { buildRedactor, parseRetryDelays, runAgentInvocation } from './agent-harness.mjs';
import { createResult, readResult } from './agent-result.mjs';
import { scrubSecrets } from './agent-history.mjs';
import { recordTiming } from './timing.mjs';
import { beginInvocation } from './agent-invocation-record.mjs';
import { resolveBuildReviewMode } from './factory-lib.mjs';
import { captureReviewHistory, historyFingerprint } from './review-history.mjs';

import { applyFeedbackReview, feedbackReserve, FEEDBACK_REVIEW_SECONDS, insufficientFeedback, isFeedbackCandidate, selectFeedbackCandidates } from './feedback-review.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Default and maximum budget of one review, including its reruns.
export const REVIEW_TIMEOUT_SECONDS = 3600;
// A rerun that could not even re-read its draft and save a module is not made.
const MIN_RETRY_SECONDS = 300;
// Keeps a call's error readable in a limitation, which is capped at 2000.
const brief = (message) =>
  message.length > 400 ? `${message.slice(0, 400)}…` : message;
const MAX_BYTES = 48 * 1024 * 1024;
const MAX_FILE = 1024 * 1024;
const blocked = (relative) =>
  relative
    .split('/')
    .some(
      (part) =>
        [
          '.git',
          '.github',
          'node_modules',
          'dist',
          'coverage',
          '.npmrc',
          'config.yml',
        ].includes(part) || /^\.env(?:\.|$)/.test(part),
    );
const sourceExtensions = /\.(?:[cm]?js|jsx|tsx?|json|md|ya?ml|css|sql|html)$/i;
const pngHeader = Buffer.from('89504e470d0a1a0a', 'hex');
const git = (workspace, args) =>
  execFileSync('git', args, {
    cwd: workspace,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
const save = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
};
// A reviewer may leave read-only directories behind; open them and retry.
function forceRemove(target) {
  const open = (entry) => {
    if (!lstatSync(entry, { throwIfNoEntry: false })?.isDirectory()) return;
    chmodSync(entry, 0o700);
    for (const name of readdirSync(entry)) open(path.join(entry, name));
  };
  try {
    rmSync(target, { recursive: true, force: true });
  } catch {
    open(target);
    rmSync(target, { recursive: true, force: true });
  }
}

export function createReviewSnapshot(
  workspace,
  artifacts,
  destination,
  redact,
) {
  const files = new Map();
  const omitted = [];
  const packages = [];
  let bytes = 0;
  function capture(from, relative, kind = 'text') {
    if (files.has(relative)) return;
    const stat = lstatSync(from);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      !safeRelative(relative) ||
      stat.size > (kind === 'screenshot' ? 4 * MAX_FILE : MAX_FILE) ||
      bytes + stat.size > MAX_BYTES
    ) {
      omitted.push(relative);
      return;
    }
    const data = readFileSync(from);
    if (kind === 'screenshot' && !data.subarray(0, 8).equals(pngHeader)) {
      omitted.push(relative);
      return;
    }
    const target = path.join(destination, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, data, { mode: 0o400 });
    files.set(relative, {
      path: relative,
      kind,
      sha256: digest(data),
      ...(kind === 'screenshot'
        ? {}
        : { lines: data.toString('utf8').split('\n').length }),
    });
    bytes += data.length;
  }
  function walk(directory, prefix, packageFiles = false) {
    if (!existsSync(directory)) return;
    if (realpathSync(directory) !== path.resolve(directory)) {
      omitted.push(prefix);
      return;
    }
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      if (entry.isSymbolicLink()) {
        omitted.push(`${prefix}/${entry.name}`);
        continue;
      }
      if (['node_modules', '.git', 'coverage'].includes(entry.name)) continue;
      const from = path.join(directory, entry.name),
        relative = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(from, relative, packageFiles);
      else if (
        sourceExtensions.test(entry.name) &&
        (!packageFiles || !entry.name.endsWith('.map'))
      )
        capture(from, relative);
    }
  }
  const tracked = git(workspace, [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ])
    .split('\0')
    .filter(Boolean);
  for (const relative of [...new Set(tracked)].sort()) {
    if (blocked(relative) || !sourceExtensions.test(relative)) continue;
    const from = path.join(workspace, relative);
    if (!existsSync(from)) continue; // Deleted application files are already in the sealed patch.
    // A directory symlink is not a source snapshot.
    if (realpathSync(from) !== path.resolve(from)) {
      omitted.push(`app/${relative}`);
      continue;
    }
    capture(from, `app/${relative}`);
  }
  // skills sync may produce ignored files; use the installed guidance, not only tracked copies.
  walk(path.join(workspace, '.agents/skills'), 'app/.agents/skills');
  const process = collectReviewProcess(artifacts);
  for (const relative of [
    'agent.patch',
    'retro.json',
    'change-summary.json',
    'repair-summary.json',
    'task-diagnostic.json',
    'task-diagnostic.md',
  ]) {
    const from = path.join(artifacts, relative);
    if (existsSync(from)) capture(from, `artifacts/${relative}`);
  }
  for (const round of process.rounds) {
    const log = `verify-${round.round}.log`;
    if (existsSync(path.join(artifacts, log)))
      capture(path.join(artifacts, log), `artifacts/${log}`);
    for (const report of round.reports) {
      capture(
        path.join(artifacts, report.source),
        `artifacts/${report.source}`,
      );
      // First and final available full QA screenshots suffice for visual review.
      // Other rounds retain their structured observations without copying all media.
      if (
        report.scope !== 'full' ||
        ![1, process.finalRound].includes(round.round)
      )
        continue;
      const dir = path.join(path.dirname(report.source), 'evidence');
      if (!existsSync(path.join(artifacts, dir))) continue;
      for (const name of readdirSync(path.join(artifacts, dir))
        .sort()
        .slice(0, 24)) {
        if (/^[A-Za-z0-9][A-Za-z0-9-]*\.png$/.test(name))
          capture(
            path.join(artifacts, dir, name),
            `artifacts/${dir}/${name}`,
            'screenshot',
          );
      }
    }
  }
  const modules = path.join(workspace, 'node_modules/@nocobase');
  if (existsSync(modules))
    for (const entry of readdirSync(modules).sort()) {
      try {
        const root = realpathSync(path.join(modules, entry));
        const manifest = JSON.parse(
          readFileSync(path.join(root, 'package.json'), 'utf8'),
        );
        packages.push({ name: manifest.name, version: manifest.version });
        walk(root, `packages/@nocobase/${entry}`, true);
      } catch {
        omitted.push(`packages/@nocobase/${entry}`);
      }
    }
  const history = captureReviewHistory(artifacts, destination, redact);
  for (const file of history.files) files.set(file.path, file);
  return {
    files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
    packages,
    omitted,
    bytes: bytes + history.bytes,
    process,
    history,
  };
}

export async function runBuildReview(
  workspace,
  artifacts,
  env = process.env,
  options = {},
) {
  env = normalizeAgentEnv(env);
  workspace = path.resolve(workspace);
  artifacts = path.resolve(artifacts);
  const output = path.join(artifacts, 'build-review.json');
  const metadata = readReviewJson(artifacts, 'task-metadata.json');
  const original = existsSync(output)
    ? readReviewJson(artifacts, 'build-review.json')
    : null;
  const basis = {
    repository: metadata.repository,
    issue: metadata.issue.number,
    runId: options.source?.runId ?? env.GITHUB_RUN_ID ?? '',
    attempt: Number(options.source?.attempt ?? env.GITHUB_RUN_ATTEMPT ?? 1),
    controlSha: options.source?.controlSha ?? env.FACTORY_CONTROL_SHA ?? '',
    rubricVersion,
  };
  // Save a non-scored result before any expensive work, including timeout paths.
  let report = {
    version: 1,
    state: 'not-reviewed',
    reason: '独立评审尚未完成；没有评分。',
    basis,
    evaluation: null,
  };
  const redact = buildRedactor(
    [
      ...credentialNames.map((name) => env[name]),
      env.GITHUB_TOKEN,
      env.GH_TOKEN,
      env.FACTORY_ADMIN_PASSWORD,
      env.FACTORY_TEST_PASSWORD,
    ].filter(Boolean),
  );
  const persist = () =>
    save(output, JSON.parse(scrubSecrets(redact(JSON.stringify(report)))));
  persist();
  const diagnosing =
    !options.source &&
    existsSync(path.join(artifacts, 'task-diagnostic.json')) &&
    readReviewJson(artifacts, 'task-diagnostic.json')?.status ===
      'needs-diagnosis';
  let snapshot, capture, invocationError;
  const started = Date.now();
  try {
    const mode = resolveBuildReviewMode(
      metadata.task,
      env,
      Boolean(options.source) || diagnosing,
    );
    report.execution = {
      buildReviewMode: mode,
      source: diagnosing
        ? 'task-diagnosis'
        : options.source
          ? 'reassessment'
          : metadata.task?.buildReviewMode
            ? 'task'
            : 'repository',
    };
    if (mode === 'off') {
      report.reason = '本轮已明确关闭独立评审；只展示流水线事实。';
      return report;
    }
    // One budget for the whole review, retries included. A stop-condition
    // diagnosis stays within its own fifteen minutes below.
    const requested = Number(
      env.FACTORY_BUILD_REVIEW_TIMEOUT_SECONDS || REVIEW_TIMEOUT_SECONDS,
    );
    if (
      !Number.isInteger(requested) ||
      requested < 30 ||
      requested > REVIEW_TIMEOUT_SECONDS
    )
      throw new Error(
        `Review timeout must be 30–${REVIEW_TIMEOUT_SECONDS} seconds`,
      );
    const deadline = diagnosing
      ? Math.min(
          Math.ceil(Date.now() / 1000) + 900,
          Number(
            env.FACTORY_JOB_STARTED_EPOCH_SECONDS ||
              Math.ceil(Date.now() / 1000),
          ) +
            21_600 -
            120,
        )
      : env.FACTORY_RUN_DEADLINE_EPOCH_SECONDS
        ? Number(env.FACTORY_RUN_DEADLINE_EPOCH_SECONDS)
        : null;
    if (deadline !== null && !Number.isSafeInteger(deadline))
      throw new Error('Invalid runner deadline');
    const remaining =
      deadline === null
        ? requested
        : Math.min(requested, deadline - Math.ceil(Date.now() / 1000) - 30);
    if (remaining < 30) {
      report.reason = 'Runner 剩余预算不足，未额外调用评审模型。';
      return report;
    }
    const requestedIdle = Number(
      env.FACTORY_BUILD_REVIEW_IDLE_TIMEOUT_SECONDS || 600,
    );
    if (
      !Number.isInteger(requestedIdle) ||
      requestedIdle < 1 ||
      requestedIdle > 1800
    )
      throw new Error(
        'FACTORY_BUILD_REVIEW_IDLE_TIMEOUT_SECONDS must be 1–1800 seconds',
      );
    const idleTimeoutSeconds = Math.min(requestedIdle, remaining);
    // The budget also covers building the snapshot, so the review never runs
    // past the runner deadline or the Actions step allowance.
    const endsAt = Date.now() + remaining * 1_000;
    const secondsLeft = () => Math.floor((endsAt - Date.now()) / 1_000);
    snapshot = mkdtempSync(path.join(os.tmpdir(), 'factory-build-review-'));
    const captured = createReviewSnapshot(
      workspace,
      artifacts,
      snapshot,
      redact,
    );
    basis.historyHash = captured.history.fingerprint;
    basis.historyVersion = 2;
    basis.history = captured.history.input;
    basis.baseSha = git(workspace, ['rev-parse', 'HEAD']).trim();
    basis.patchHash = digest(readFileSync(path.join(artifacts, 'agent.patch')));
    basis.lockfileHash =
      captured.files.find((file) => file.path === 'app/pnpm-lock.yaml')
        ?.sha256 ?? null;
    basis.packages = captured.packages;
    basis.reviewCriteriaHash = digest(metadata.task?.reviewCriteria ?? '');
    basis.artifactHash = reviewArtifactHash(artifacts);
    if (options.source) {
      if (
        basis.baseSha !== options.source.baseSha ||
        basis.patchHash !== options.source.patchHash
      )
        throw new Error('Replay does not reconstruct the sealed application');
      if (
        original?.basis?.lockfileHash &&
        original.basis.lockfileHash !== basis.lockfileHash
      )
        throw new Error('Replay lockfile differs from original assessment');
      if (
        original?.basis?.packages &&
        JSON.stringify(original.basis.packages) !==
          JSON.stringify(basis.packages)
      )
        throw new Error(
          'Replay installed packages differ from original assessment',
        );
    }
    const catalogHash = digest(JSON.stringify(captured.files));
    save(path.join(snapshot, 'review-files.json'), captured.files);
    save(path.join(artifacts, 'build-review-files.json'), captured.files);
    const changedFiles = [
      ...new Set(
        readFileSync(path.join(artifacts, 'agent.patch'), 'utf8')
          .split('\n')
          .filter((line) => line.startsWith('+++ b/'))
          .map((line) => `app/${line.slice(6)}`),
      ),
    ].filter((file) => captured.files.some((item) => item.path === file));
    const reservedFeedbackSeconds = diagnosing ? 0 : feedbackReserve(secondsLeft());
    const assessmentSecondsLeft = () => secondsLeft() - reservedFeedbackSeconds;
    const firstBudget = assessmentSecondsLeft();
    if (firstBudget < 30) {
      report.reason = 'Runner 剩余预算不足，未额外调用评审模型。';
      return report;
    }
    const input = {
      rubricVersion,
      basis,
      requirements: metadata.task?.requirements ?? '',
      acceptanceCriteria: metadata.task?.acceptanceCriteria ?? '',
      reviewCriteria: metadata.task?.reviewCriteria ?? '',
      history: captured.history.input,
      process: captured.process,
      changedFiles: changedFiles.slice(0, 80),
      catalog: {
        path: 'review-files.json',
        sha256: catalogHash,
        count: captured.files.length,
      },
      omittedCount: captured.omitted.length,
      budgetSeconds: firstBudget,
    };
    basis.inputHash = digest(JSON.stringify(input));
    save(path.join(snapshot, 'review-input.json'), input);
    save(path.join(snapshot, 'assessment.json'), {
      version: rubricVersion,
      inputHash: basis.inputHash,
      summary: '尚未完成任何模块的证据评审。',
      modules: [],
      findings: [],
      evidence: [],
      ui: {
        status: 'not-reviewed',
        score: null,
        reason: '尚未执行跨页面图像审阅。',
        evidence: [],
      },
      limitations: ['评审进行中，未覆盖的模块不推断通过。'],
      progress: { complete: false, pendingModules: [] },
    });
    // Persist the compact input/provenance, not the entire package catalog in the prompt.
    save(path.join(artifacts, 'build-review-input.json'), input);
    const tools = path.join(snapshot, '.review-tools');
    const promptPath = path.join(snapshot, 'review-prompt.md');
    // Only the hash-checked captured inputs and the draft carry over between
    // calls. Everything else is removed or written again, never followed: a
    // failed call's instructions, engine home, checker or input files must not
    // reach the next one. The adapter recreates its engine home (.review-agent).
    const carried = new Set([
      'app',
      'artifacts',
      'packages',
      'assessment.json',
    ]);
    const prepareCall = (prompt) => {
      for (const name of readdirSync(snapshot))
        if (!carried.has(name)) forceRemove(path.join(snapshot, name));
      save(path.join(snapshot, 'review-files.json'), captured.files);
      save(path.join(snapshot, 'review-input.json'), input);
      // The snapshot root has no application instructions or reused agent session.
      writeFileSync(
        path.join(snapshot, 'AGENTS.md'),
        'Read-only assessment. Follow review-prompt.md. Do not build, repair, install, publish, or run application code. Update assessment.json atomically via assessment.tmp.json.\n',
      );
      // A local, model-free check gives feedback before the same invocation ends.
      // The trusted final evaluator still runs independently outside this copy.
      mkdirSync(tools, { mode: 0o700 });
      for (const name of [
        'build-review.mjs',
        'feedback-review.mjs',
        'check-review-draft.mjs',
        'review-history.mjs',
        'history-redaction.mjs',
      ]) {
        writeFileSync(
          path.join(tools, name),
          readFileSync(path.join(HERE, name)),
          { mode: 0o400 },
        );
      }
      writeFileSync(promptPath, prompt);
    };
    const renderPrompt = (budgetSeconds) =>
      readFileSync(path.join(HERE, '../prompts/build-review.md'), 'utf8')
        .replaceAll('{{INPUT_HASH}}', basis.inputHash)
        .replaceAll('{{BUDGET_SECONDS}}', String(budgetSeconds)) +
      '\n\n' +
      readFileSync(
        path.join(HERE, '../prompts/build-review-history.md'),
        'utf8',
      );
    prepareCall(renderPrompt(firstBudget));
    const adapter = resolveAgent(env);
    const agentEnv = engineEnv(
      {
        ...env,
        CODE_AGENT_THINKING: env.FACTORY_REVIEW_THINKING || 'medium',
        FACTORY_AGENT_ROLE: 'review',
        ...(diagnosing
          ? { FACTORY_RUN_DEADLINE_EPOCH_SECONDS: String(deadline) }
          : {}),
      },
      adapter.credentials,
    );
    for (const name of [
      'GITHUB_TOKEN',
      'GH_TOKEN',
      'FACTORY_ADMIN_PASSWORD',
      'FACTORY_TEST_PASSWORD',
    ])
      delete agentEnv[name];
    const log = path.join(artifacts, 'agent-review.jsonl');
    capture = beginInvocation({
      log,
      prompt: promptPath,
      workspace: snapshot,
      engine: adapter.id,
      phase: 'review',
      secrets: credentialNames.map((name) => env[name]),
      env,
      contextFiles: ['review-input.json', 'review-files.json'],
    });
    // Stdin-driven engines read the prompt here, so each rerun creates its own.
    const createReviewInvocation = () =>
      adapter.createInvocation({
        workspace: snapshot,
        prompt: promptPath,
        log,
        agentDir: path.join(snapshot, '.review-agent'),
        env: agentEnv,
      });
    const invocation = createReviewInvocation();
    let actualVersion = null,
      configuredVersion = adapter.version;
    if (env.FACTORY_AGENT_INSTALL_RECORD) {
      const installed = JSON.parse(
        readFileSync(env.FACTORY_AGENT_INSTALL_RECORD, 'utf8'),
      );
      if (installed.engine !== adapter.id)
        throw new Error('Reviewer engine differs from installed engine');
      actualVersion = installed.actualVersion;
      configuredVersion = installed.configuredVersion;
    }
    report.reviewer = {
      engine: adapter.id,
      model: invocation.model,
      version: actualVersion,
      runId: env.GITHUB_RUN_ID ?? '',
      attempt: Number(env.GITHUB_RUN_ATTEMPT ?? 1),
      controlSha: env.FACTORY_CONTROL_SHA ?? '',
      replay: Boolean(options.source),
    };
    capture.start({ ...invocation, actualVersion, configuredVersion });
    // One result for every call, so usage and the transcript cover all of them.
    const result = createResult({
      engine: adapter.id,
      model: invocation.model,
      configuredVersion,
      actualVersion,
      completion: adapter.completion ?? 'event',
      phase: 'review',
      role: 'review',
    });
    // runAgentInvocation already reruns a call that ends on a model-service
    // error. The same schedule bounds reruns of a review that still has no
    // publishable assessment for another model-side reason. A stop-condition
    // diagnosis stays a single bounded call.
    const modelRetryDelays = parseRetryDelays(
      env.FACTORY_MODEL_RETRY_DELAYS_SECONDS,
    );
    const retryDelays = diagnosing ? [] : modelRetryDelays;
    // Deterministic or tampered failures end the review; see BUILD_REVIEW.md.
    const tainted = () => {
      try {
        assertCapturedInputs(snapshot, captured.files);
        return false;
      } catch {
        return true;
      }
    };
    const review = async (current, budget, attempt) => {
      let error;
      try {
        await runAgentInvocation({
          ...current,
          log,
          append: attempt > 1,
          parseEvent: adapter.parseEvent,
          secrets: [
            ...(current.secrets ?? []),
            ...credentialNames.map((name) => env[name]),
          ],
          result,
          invocationTimeoutSeconds: budget,
          idleTimeoutSeconds: Math.min(idleTimeoutSeconds, budget),
          retryDelaysSeconds: modelRetryDelays,
        });
      } catch (caught) {
        error = caught;
      }
      let call;
      try {
        call = readResult(log);
      } catch (caught) {
        return { attempt, error: caught, retryable: false };
      }
      const finished =
        call?.status === 'completed' &&
        (call.completion === 'exit' || call.terminalEvent);
      // Both watchdogs may interrupt a valid checkpoint. Auth/protocol/crash
      // failures still cannot promote leftover JSON into an assessment.
      const interruption =
        call?.status === 'stalled'
          ? `评审连续 ${Math.min(idleTimeoutSeconds, budget)} 秒没有 stdout/stderr 输出（stalled）`
          : call?.status === 'timed_out'
            ? `评审达到 ${budget} 秒调用时限（timed_out）`
            : null;
      if (interruption) error ??= new Error(interruption);
      // A spent budget, a configuration error, a model-service error the
      // harness has already rerun, a rejected request or a missing engine is
      // final; a stall, a crash or a protocol error is not.
      const retryable =
        call?.status === 'stalled' ||
        (call?.status !== 'timed_out' &&
          call?.status !== 'handoff' &&
          (!call?.failure || call.failure.category === 'agent_failure') &&
          !/(?:^|\b(?:HTTP(?: status)?|status(?:Code)?|code|API Error)\s*[:=]?\s*)4(?!08|99)\d{2}\b|\bENOENT\b/i.test(
            call?.error ?? '',
          ));
      if (!finished && !interruption)
        return {
          attempt,
          error:
            error ??
            new Error(
              `Reviewer invocation did not complete (status: ${call?.status ?? 'missing'}, exit code: ${call?.exitCode ?? 'unknown'})`,
            ),
          retryable: retryable && !tainted(),
          wait: true,
        };
      try {
        return {
          attempt,
          error,
          interruption,
          assessed: finalizeAssessment(snapshot, captured, basis, finished),
          // A stalled call keeps its checkpoint; a rerun may still finish it.
          retryable: call.status === 'stalled',
          wait: true,
        };
      } catch (caught) {
        return {
          attempt,
          error: interruption
            ? new Error(
                `${interruption}；未取得可发布的模块检查点：${caught.message}`,
                { cause: caught },
              )
            : caught,
          // The validator's message is enough to correct a rejected draft; an
          // edited reviewed input taints the snapshot for every later call.
          retryable: retryable && !tainted(),
          wait: Boolean(interruption),
        };
      }
    };
    const modules = (outcome) => outcome.assessed.evaluation.modules.length;
    let outcome = await review(invocation, firstBudget, 1);
    let saved = outcome.assessed ? outcome : null;
    for (;;) {
      const retry = outcome.attempt;
      const delaySeconds = outcome.wait ? retryDelays[retry - 1] : 0;
      const budget = assessmentSecondsLeft() - (delaySeconds ?? 0);
      if (
        !outcome.retryable ||
        retry > retryDelays.length ||
        budget < MIN_RETRY_SECONDS
      )
        break;
      const reason = brief(
        redact(String(outcome.error?.message ?? outcome.interruption)),
      );
      // The rerun is a new session on the same snapshot: its saved draft is
      // what carries the earlier work over.
      const note =
        `## 重试说明（第 ${retry + 1} 次评审调用，最多 ${retryDelays.length + 1} 次）\n\n` +
        `上一次评审调用${outcome.assessed ? '中断' : '没有产出可发布的结果'}：${reason}\n` +
        '这是新会话，不保留上一次的对话；快照、`review-input.json` 与 `assessment.json` 草稿原样保留，inputHash 不变。\n' +
        (saved
          ? `第 ${saved.attempt} 次调用曾保存并通过校验 ${modules(saved)} 个模块；以当前草稿的检查结果为准。\n`
          : '') +
        '先运行 `node .review-tools/check-review-draft.mjs` 查看草稿：保留已通过校验的模块，按检查输出修正问题，再按 progress.pendingModules 继续未评模块。\n' +
        `不要从头重读已评模块的材料。本次硬上限 ${budget} 秒，以此为准（review-input.json 的 budgetSeconds 是第一次调用的预算）；每完成一个模块立即原子保存并检查；其余规则不变。\n`;
      appendFileSync(
        log,
        `${JSON.stringify({ type: 'factory_review_retry', retry, of: retryDelays.length, delaySeconds, budgetSeconds: budget, reason, note })}\n`,
      );
      process.stderr.write(
        `Build review call ${retry} ended without a complete assessment; rerunning it in ${delaySeconds} seconds (review retry ${retry}/${retryDelays.length}).\n`,
      );
      await sleep(delaySeconds * 1_000);
      let current;
      try {
        prepareCall(`${renderPrompt(budget)}\n\n${note}`);
        current = createReviewInvocation();
      } catch (error) {
        // Setting up a rerun cannot discard what an earlier call saved.
        outcome = {
          attempt: retry,
          error: new Error(
            `第 ${retry + 1} 次评审调用未能启动：${error.message}`,
            { cause: error },
          ),
          retryable: false,
        };
        break;
      }
      outcome = await review(current, budget, retry + 1);
      // A shorter checkpoint never replaces a richer one from an earlier call.
      if (
        outcome.assessed &&
        (!saved ||
          !outcome.assessed.partial ||
          modules(outcome) >= modules(saved))
      )
        saved = outcome;
    }
    report.execution.reviewCalls = outcome.attempt;
    invocationError = outcome.error;
    const calls = outcome.attempt > 1 ? `共 ${outcome.attempt} 次评审调用` : '';
    if (!saved)
      throw calls
        ? new Error(
            `${calls}均未取得可发布的结果，最后一次：${brief(outcome.error.message)}`,
            { cause: outcome.error },
          )
        : outcome.error;
    const { assessed, interruption } = saved;
    if (historyFingerprint(artifacts) !== basis.historyHash)
      throw new Error('Reviewer source history changed during assessment');
    // Never trust a self-authored feedbackReview in the original draft. The
    // separate session can only append checked evidence and verdicts, not edit
    // the assessed finding, its confidence, lifecycle or module scores.
    report.evaluation = { ...assessed.evaluation, findings: assessed.evaluation.findings.map(finding => {
      const original = { ...finding };
      delete original.feedbackReview;
      return isFeedbackCandidate(original) ? { ...original, feedbackReview: insufficientFeedback('定向证据复核尚未完成。') } : original;
    }) };
    const candidates = selectFeedbackCandidates(report.evaluation);
    report.execution.feedbackReviewCalls = 0;
    if (candidates.length) {
      let reason;
      const budget = Math.min(FEEDBACK_REVIEW_SECONDS, secondsLeft());
      if (diagnosing) reason = '停止诊断只允许单次只读调用；保留待定向复核的候选。';
      else if (budget < 30) reason = '剩余预算不足 30 秒；保留为待核实候选。';
      else if (tainted()) reason = '冻结输入已变化；不能完成定向证据复核。';
      else try {
        const feedbackInput = { version: 1, inputHash: basis.inputHash, candidates,
          evidence: report.evaluation.evidence, packages: basis.packages, budgetSeconds: budget };
        const feedbackPrompt = readFileSync(path.join(HERE, '../prompts/feedback-review.md'), 'utf8')
          .replaceAll('{{INPUT_HASH}}', basis.inputHash).replaceAll('{{BUDGET_SECONDS}}', String(budget));
        prepareCall(feedbackPrompt);
        writeFileSync(path.join(snapshot, 'AGENTS.md'), 'Read-only candidate evidence review. Follow review-prompt.md. Only write feedback-assessment.json atomically. Do not change assessment.json, build, repair, install, publish, or run application code.\n');
        save(path.join(snapshot, 'feedback-input.json'), feedbackInput);
        save(path.join(artifacts, 'build-review-feedback-input.json'), JSON.parse(scrubSecrets(redact(JSON.stringify(feedbackInput)))));
        const inputDigest = digest(readFileSync(path.join(snapshot, 'feedback-input.json')));
        appendFileSync(log, `${JSON.stringify({ type: 'factory_feedback_review', budgetSeconds: budget,
          candidateIds: candidates.map(finding => finding.id), inputHash: basis.inputHash, inputDigest, prompt: feedbackPrompt })}\n`);
        report.execution.feedbackReviewCalls = 1;
        report.execution.feedbackReview = { version: 1, inputHash: basis.inputHash, candidateIds: candidates.map(finding => finding.id), completed: false };
        const current = createReviewInvocation();
        await runAgentInvocation({ ...current, log, append: true, parseEvent: adapter.parseEvent,
          secrets: [...(current.secrets ?? []), ...credentialNames.map(name => env[name])], result,
          invocationTimeoutSeconds: budget, idleTimeoutSeconds: Math.min(idleTimeoutSeconds, budget), retryDelaysSeconds: [] });
        const call = readResult(log);
        if (call?.status !== 'completed' || (call.completion !== 'exit' && !call.terminalEvent))
          throw new Error(`定向复核未正常结束（${call?.status ?? 'missing'}）；未采用遗留结论`);
        assertCapturedInputs(snapshot, captured.files);
        readReviewJson(snapshot, 'feedback-input.json'); // Reject a replaced symlink before reading its bytes.
        if (digest(readFileSync(path.join(snapshot, 'feedback-input.json'))) !== inputDigest)
          throw new Error('定向复核改动了候选输入');
        if (historyFingerprint(artifacts) !== basis.historyHash)
          throw new Error('定向复核期间源历史发生变化');
        const draft = readReviewJson(snapshot, 'feedback-assessment.json');
        report.evaluation = applyFeedbackReview(report.evaluation, draft, candidates, evidence => {
          const checked = { ...report.evaluation, evidence };
          validateEvaluation(checked, basis.inputHash, captured.files, basis.rubricVersion);
          return materializeEvidence(checked, snapshot, captured.files).evidence;
        });
        report.execution.feedbackReview.completed = true;
      } catch (error) {
        reason = `定向复核未完成：${brief(redact(String(error.message)))}`;
        invocationError ??= error;
      }
      if (reason) report.evaluation.findings = report.evaluation.findings.map(finding => isFeedbackCandidate(finding)
        ? { ...finding, feedbackReview: insufficientFeedback(reason) } : finding);
    }
    if (captured.history.input.coverage !== 'available') {
      report.evaluation.limitations.unshift(
        `原始交互历史 ${captured.history.input.coverage}；不能推断完整试错过程。${captured.history.input.limitations.slice(0, 3).join('；').slice(0, 1600)}`,
      );
      report.evaluation.limitations = report.evaluation.limitations.slice(
        0,
        30,
      );
    }
    const partial = assessed.partial;
    report.state = partial ? 'partial' : 'completed';
    // A later call that failed never replaces an earlier validated checkpoint.
    const later =
      saved !== outcome
        ? `；采用第 ${saved.attempt} 次调用保存的检查点（最后一次调用：${brief(outcome.error?.message ?? '保存的模块更少')}）`
        : '';
    report.reason = partial
      ? `${interruption ?? '尚有未评模块或未核对过程'}${calls ? `（${calls}）` : ''}${later}；仅展示已保存并通过证据校验的模块，不代表完整评审。`
      : `独立 Agent 评审完成${calls ? `（${calls}）` : ''}；评分是基于本次证据的意见，不替代业务 QA 或人工评审。`;
    if (partial) {
      if (report.evaluation.limitations.length === 30)
        report.evaluation.limitations.pop();
      report.evaluation.limitations.push(report.reason);
    }
  } catch (error) {
    invocationError ??= error;
    report.state = 'failed';
    report.evaluation = null;
    report.reason = `独立评审未完成或证据校验失败：${error.message}。业务验收结果保持不变。`;
  } finally {
    capture?.finish(invocationError);
    persist();
    recordTiming('agent:review', started, report.state === 'failed' ? 1 : 0);
    try {
      if (snapshot) forceRemove(snapshot);
    } catch (error) {
      process.stderr.write(
        `Could not remove the review snapshot ${snapshot}: ${error.message}\n`,
      );
    }
  }
  return report;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [workspace, artifacts] = process.argv.slice(2);
  if (!workspace || !artifacts)
    throw new Error('Usage: run-build-review.mjs <workspace> <artifact-dir>');
  await runBuildReview(workspace, artifacts);
}

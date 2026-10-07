import { createHash } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preserveReviewHistory } from './review-history.mjs';
import {
  diagnostic,
  effectiveBudget,
  observedFailures,
  recordFailures,
  renderDiagnostic,
} from './task-policy.mjs';

const phases = [
  'implementation',
  'verify',
  'repair',
  'qa-focused',
  'qa-full',
  'done',
];
const contextFiles = ['verification.log', 'report.json', 'application.log'];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));

export function inputHash(metadata) {
  const task = metadata.task ?? {};
  return hash(
    JSON.stringify({
      issue: metadata.issue?.number,
      targetBranch: task.targetBranch,
      taskType: task.taskType,
      requirements: task.requirements,
      acceptanceCriteria: task.acceptanceCriteria,
      sampleData: task.sampleData,
      ...(task.buildReviewMode
        ? { buildReviewMode: task.buildReviewMode }
        : {}),
    }),
  );
}

export function readState(file) {
  const state = json(file);
  if (
    state.version !== 1 ||
    !phases.includes(state.phase) ||
    !/^[a-f0-9]{64}$/u.test(state.inputHash) ||
    !['verificationAttempts', 'repairAttempts'].every(
      (key) => Number.isSafeInteger(state[key]) && state[key] >= 0,
    ) ||
    !Array.isArray(state.pendingCriteria) ||
    state.pendingCriteria.some(
      (id) => typeof id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/u.test(id),
    ) ||
    !Number.isFinite(state.fullQaSeconds) ||
    state.fullQaSeconds < 0 ||
    !['build', 'browser'].includes(state.failureKind)
  ) {
    throw new Error('Invalid factory pipeline checkpoint.');
  }
  return state;
}

// Trusted evaluation-plan budget, copied once into the checkpoint. Handoffs,
// new attempts and recoveries restore it instead of re-reading any input.
export function normalizeBudget(value) {
  if (value == null) return null;
  const valid = (n, min, max) =>
    Number.isSafeInteger(n) && n >= min && n <= max;
  if (
    !valid(value.maxRepairAttempts, 0, 10) ||
    !valid(value.maxActiveSeconds, 600, 86_400) ||
    !valid(value.maxContinuations, 0, 10)
  )
    throw new Error('Invalid evaluation sample budget.');
  return {
    maxRepairAttempts: value.maxRepairAttempts,
    maxActiveSeconds: value.maxActiveSeconds,
    maxContinuations: value.maxContinuations,
  };
}
// Active time excludes queueing: previous jobs' total plus this job since it started.
export function activeSeconds(state, now = Date.now() / 1000) {
  const started = Number(process.env.FACTORY_JOB_STARTED_EPOCH_SECONDS);
  const base = Number.isSafeInteger(state.activeSecondsBase)
    ? state.activeSecondsBase
    : 0;
  return Number.isSafeInteger(started) && started > 0
    ? base + Math.max(0, Math.floor(now - started))
    : (state.activeSeconds ?? base);
}
const minimumFor = (state, phase) =>
  phase === 'qa-full'
    ? Math.max(
        900,
        Math.min(10_800, Math.ceil((state.fullQaSeconds || 0) * 1.1)),
      )
    : phase === 'verify'
      ? 120
      : 300;
export const ARCHIVE_RESERVE_SECONDS = 300;
export function budgetExhausted(state, phase, now = Date.now() / 1000) {
  if (state.stopReason) return state.stopReason.reason;
  const budget = effectiveBudget(state);
  if ((state.priorExecutions ?? 0) > budget.maxContinuations)
    return '整个任务最多执行两段（每段最多 5 小时），续跑次数已达上限。';
  if (phase === 'repair' && state.repairAttempts >= budget.maxRepairAttempts)
    return `工厂修复次数已达上限 ${budget.maxRepairAttempts}`;
  const remaining =
    budget.maxActiveSeconds -
    activeSeconds(state, now) -
    ARCHIVE_RESERVE_SECONDS;
  if (phase && remaining < minimumFor(state, phase))
    return `剩余主动执行时间不足以开始 ${phase}（预算 ${budget.maxActiveSeconds} 秒）`;
  return null;
}

// Used time and executions never drop below GitHub's own job records.
// Sources: prepare's measurement in the metadata, and the Agent job's own
// admission re-measurement (for "Re-run failed jobs" that skip prepare).
function trustedUsage(budget, metadata, state, restoring = false) {
  const used = metadata.evaluation?.budgetUsed ?? {};
  const count = (value) =>
    Number.isSafeInteger(Number(value)) && Number(value) >= 0
      ? Number(value)
      : 0;
  const activeSeconds = Math.max(
    count(state.activeSeconds),
    count(used.activeSeconds),
    count(process.env.FACTORY_EVALUATION_USED_SECONDS),
  );
  const executionId = process.env.GITHUB_RUN_ID
    ? process.env.GITHUB_RUN_ID + ':' + (process.env.GITHUB_RUN_ATTEMPT || '1')
    : null;
  const advancing =
    restoring && (!executionId || executionId !== state.executionId);
  // Only continuations raise the floor: initialize and restoreState reject a
  // GitHub Re-run (requireFreshRunAttempt) before this runs, except an attempt
  // whose earlier attempts never started the agent, which executed nothing.
  const floor = count(process.env.FACTORY_TASK_CONTINUATION);
  return {
    ...(budget ? { budget } : {}),
    activeSeconds,
    activeSecondsBase:
      restoring && !advancing
        ? (state.activeSecondsBase ?? activeSeconds)
        : activeSeconds,
    executionId,
    priorExecutions: Math.max(
      count(state.priorExecutions) + Number(advancing),
      floor,
      count(used.executions),
      count(process.env.FACTORY_EVALUATION_USED_EXECUTIONS),
    ),
  };
}

export function saveState(file, state) {
  state.activeSeconds = activeSeconds(state);
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, file);
  // Public progress has no prompts, observations, credentials or source logs.
  const progressPath = path.join(path.dirname(file), 'progress.json');
  let previous;
  try {
    previous = json(progressPath);
  } catch {
    /* First progress sample. */
  }
  const now = Date.now();
  const samePhase =
    previous?.runId === (process.env.GITHUB_RUN_ID ?? '') &&
    previous?.attempt === (process.env.GITHUB_RUN_ATTEMPT ?? '') &&
    previous?.phase === state.phase &&
    previous?.verificationAttempts === state.verificationAttempts &&
    previous?.repairAttempts === state.repairAttempts;
  const progress = {
    runId: process.env.GITHUB_RUN_ID ?? '',
    attempt: process.env.GITHUB_RUN_ATTEMPT ?? '',
    updatedAt: now,
    phaseStartedAt:
      samePhase && Number.isSafeInteger(previous.phaseStartedAt)
        ? previous.phaseStartedAt
        : now,
    phase: state.phase,
    outcome: state.outcome ?? 'running',
    verificationAttempts: state.verificationAttempts,
    repairAttempts: state.repairAttempts,
    pendingCriteria: state.pendingCriteria,
    ...(state.stopReason ? { stopCode: state.stopReason.code } : {}),
  };
  writeFileSync(
    `${progressPath}.tmp`,
    `${JSON.stringify(progress, null, 2)}\n`,
  );
  renameSync(`${progressPath}.tmp`, progressPath);
  const message = `Factory phase: ${state.phase} (${state.outcome ?? 'running'}); verification ${state.verificationAttempts}; repair ${state.repairAttempts}; pending ${state.pendingCriteria.join(', ') || 'none'}`;
  console.error(message);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n\n`);
}

export function requireFreshRunAttempt() {
  // GitHub retries use fresh runners but do not restore the previous attempt's
  // checkpoint. Explicit recovery validates and restores it in a new Run.
  // The agent job's re-run guard sets FACTORY_FIRST_AGENT_ATTEMPT only after
  // reading every earlier attempt's jobs and finding none that started it:
  // then nothing could be lost, and this attempt is the task's first.
  if (
    Number(process.env.GITHUB_RUN_ATTEMPT || 1) > 1 &&
    process.env.FACTORY_FIRST_AGENT_ATTEMPT !== 'true'
  )
    throw new Error(
      'GitHub Re-run cannot preserve task repair limits. Use an explicit recovery Run with a matching checkpoint; stopped tasks require a new build after diagnosis.',
    );
}

export function initialize(file, metadata) {
  requireFreshRunAttempt();
  if (existsSync(file)) {
    const state = readState(file);
    if (state.inputHash !== inputHash(metadata))
      throw new Error(
        'Checkpoint belongs to different business input; start a new build instead of resuming it.',
      );
    return state;
  }
  const state = {
    version: 1,
    inputHash: inputHash(metadata),
    controlSha: process.env.FACTORY_CONTROL_SHA ?? '',
    phase: 'verify',
    verificationAttempts: 0,
    repairAttempts: 0,
    pendingCriteria: [],
    failureKind: 'build',
    fullQaSeconds: 0,
    ...trustedUsage(normalizeBudget(metadata.evaluation?.budget), metadata, {}),
  };
  saveState(file, state);
  return state;
}

// The one checkpoint validator: why a saved checkpoint cannot be resumed, or
// null. restoreState throws its answer; keepRefusal applies the same rules, so a
// continuation that failed before restoring never keeps a checkpoint the next
// restore would refuse. strictControl demands the exact selected control plane
// (as an explicit recovery does); a restore accepts a checkpoint that predates
// recording one.
export function checkpointRefusal(
  state,
  { patch, metadata, controlSha, strictControl = false, hasRepairLog },
) {
  if (state.inputHash !== inputHash(metadata))
    return 'Checkpoint business input has changed.';
  if (!state.patchHash || hash(patch) !== state.patchHash)
    return 'Checkpoint patch hash does not match the restored code.';
  if (
    strictControl
      ? !controlSha || state.controlSha !== controlSha
      : state.controlSha && controlSha && state.controlSha !== controlSha
  )
    return 'Checkpoint factory SHA differs from the selected control plane; resume with its pinned SHA instead of restarting QA.';
  if (state.stopReason)
    return 'This task has stopped for diagnosis; recovery cannot reset its limits. Start a new task after addressing the cause.';
  try {
    // The fresh prepare metadata is trusted; the checkpoint shared the Agent's runner.
    const expected = normalizeBudget(metadata.evaluation?.budget);
    if (
      expected &&
      JSON.stringify(normalizeBudget(state.budget ?? null)) !==
        JSON.stringify(expected)
    )
      return 'Checkpoint budget differs from the trusted evaluation sample budget.';
  } catch (error) {
    return error.message;
  }
  if (state.phase === 'repair' && !hasRepairLog)
    return 'Repair checkpoint is missing its diagnostic context.';
  return null;
}

// Why a continuation that failed before restoring must not keep its handed-off
// checkpoint, or null. Everything a restore or an explicit recovery refuses on
// purpose (input edited, patch or control plane changed, task stopped, budget
// changed, repair context lost) is never published as recoverable work, and a
// checkpoint that already finished verification has nothing to resume.
export function keepRefusal(
  state,
  patch,
  metadata,
  selectedControlSha,
  hasRepairLog = false,
) {
  const refusal = checkpointRefusal(state, {
    patch,
    metadata,
    controlSha: selectedControlSha,
    strictControl: true,
    hasRepairLog,
  });
  if (refusal) return refusal;
  if (state.phase === 'done')
    return 'Checkpoint already finished verification.';
  return null;
}

export function restoreState(source, destination, metadata) {
  requireFreshRunAttempt();
  const restoreHistory = () => {
    try {
      preserveReviewHistory(source, destination, metadata);
    } catch {
      console.error(
        'Review history could not be preserved; pipeline/QA state is unchanged.',
      );
    }
  };
  const file = path.join(destination, 'pipeline-state.json');
  const saved = path.join(source, 'pipeline-state.json');
  if (!existsSync(saved)) {
    console.error(
      'Legacy handoff: no stage checkpoint; rebuilding and running full QA.',
    );
    const state = initialize(file, metadata);
    restoreHistory();
    return state;
  }
  const state = readState(saved);
  const patchFile = path.join(source, 'agent.patch');
  const refusal = checkpointRefusal(state, {
    patch: existsSync(patchFile) ? readFileSync(patchFile) : Buffer.alloc(0),
    metadata,
    controlSha: process.env.FACTORY_CONTROL_SHA,
    hasRepairLog: existsSync(
      path.join(source, 'repair-context', 'verification.log'),
    ),
  });
  if (refusal) throw new Error(refusal);
  state.controlSha = process.env.FACTORY_CONTROL_SHA ?? state.controlSha;
  state.outcome = 'running';
  const expected = normalizeBudget(metadata.evaluation?.budget);
  Object.assign(state, trustedUsage(expected, metadata, state, true));
  mkdirSync(destination, { recursive: true });
  const context = path.join(destination, 'repair-context');
  mkdirSync(context, { recursive: true });
  for (const name of contextFiles) {
    const from = path.join(source, 'repair-context', name);
    const to = path.join(context, name);
    if (existsSync(from)) copyFileSync(from, to);
    else rmSync(to, { force: true });
  }
  if (
    state.phase === 'repair' &&
    !existsSync(path.join(context, 'verification.log'))
  )
    throw new Error('Repair checkpoint is missing its diagnostic context.');
  // Process/browser/DB state is not restored. Full QA always starts clean;
  // a report-only interruption resumes its QA scope, never stale browser state.
  saveState(file, state);
  restoreHistory();
  return state;
}

export function canStart(state, phase, deadline, now = Date.now() / 1000) {
  if (!deadline) return true;
  if (!Number.isSafeInteger(Number(deadline)) || Number(deadline) <= 0)
    throw new Error('Invalid runner deadline.');
  return Number(deadline) - now >= minimumFor(state, phase);
}

export function stopPipeline(file, state, reason, code = 'task-budget') {
  state.stopReason ??= { code, reason };
  state.outcome = 'budget-exhausted';
  saveState(file, state);
  const report = diagnostic(
    state,
    state.stopReason.reason,
    state.stopReason.code,
  );
  const root = path.dirname(file);
  writeFileSync(
    path.join(root, 'task-diagnostic.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  writeFileSync(
    path.join(root, 'task-diagnostic.md'),
    renderDiagnostic(report),
  );
}

export function handoffRefusal(
  state,
  continuation = 1,
  now = Date.now() / 1000,
) {
  if (state.stopReason) return state.stopReason.reason;
  const budget = effectiveBudget(state);
  if (
    Math.max(continuation, (state.priorExecutions ?? 0) + 1) >
    budget.maxContinuations
  )
    return '整个任务仅允许一次 5 小时超时后的 Handoff；续跑次数已达上限，本次停止并进入只读诊断。';
  if (
    activeSeconds(state, now) + ARCHIVE_RESERVE_SECONDS >=
    budget.maxActiveSeconds
  )
    return '任务累计主动执行时间预算已用尽；停止续跑并保留诊断证据。';
  return null;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [command, file, ...args] = process.argv.slice(2);
  if (command === 'restore') {
    restoreState(file, args[0], json(args[1]));
  } else if (command === 'keepable') {
    // keepable <checkpoint-state> <patch> <task-metadata>; exits 1 with the reason.
    const refusal = keepRefusal(
      readState(file),
      readFileSync(args[0]),
      json(args[1]),
      process.env.FACTORY_CONTROL_SHA,
      existsSync(
        path.join(path.dirname(file), 'repair-context', 'verification.log'),
      ),
    );
    if (refusal) {
      console.error(`Not keeping the handed-off checkpoint: ${refusal}.`);
      process.exit(1);
    }
  } else if (command === 'init') {
    initialize(file, json(args[0]));
  } else {
    const state = readState(file);
    if (command === 'read') {
      console.log(
        `${state.phase} ${state.verificationAttempts} ${state.repairAttempts}`,
      );
    } else if (command === 'phase') {
      console.log(state.phase);
    } else if (command === 'budget') {
      // 76: the trusted evaluation budget is spent (terminal); 75: runner time only (handoff).
      const exhausted = budgetExhausted(state, args[0]);
      if (exhausted) {
        stopPipeline(file, state, exhausted);
        console.error(exhausted);
        process.exit(76);
      }
      if (
        !canStart(
          state,
          args[0],
          process.env.FACTORY_RUN_DEADLINE_EPOCH_SECONDS,
        )
      )
        process.exit(75);
    } else if (command === 'handoff') {
      const refusal = handoffRefusal(state);
      if (refusal) {
        stopPipeline(file, state, refusal, 'handoff-limit');
        process.exit(76);
      }
      state.outcome = 'handoff';
      saveState(file, state);
      process.exit(75);
    } else if (command === 'seal') {
      state.patchHash = hash(readFileSync(args[0]));
      saveState(file, state);
    } else if (command === 'set') {
      if (!phases.includes(args[0])) throw new Error('Unknown pipeline phase.');
      state.phase = args[0];
      state.outcome = 'running';
      if (args[1] !== undefined) state.verificationAttempts = Number(args[1]);
      if (args[2] !== undefined) state.repairAttempts = Number(args[2]);
      if (args[3] !== undefined) state.fullQaSeconds = Number(args[3]);
      saveState(file, state);
    } else if (command === 'outcome') {
      if (
        ![
          'running',
          'passed',
          'failed',
          'blocked',
          'handoff',
          'budget-exhausted',
        ].includes(args[0])
      )
        throw new Error('Unknown pipeline outcome.');
      state.outcome = args[0];
      saveState(file, state);
    } else if (command === 'focus') {
      const focus = existsSync(args[0]) ? json(args[0]) : null;
      state.pendingCriteria = focus?.task?.qaCriteriaIds ?? [];
      saveState(file, state);
    } else if (command === 'metadata') {
      const metadata = json(args[0]);
      if (state.pendingCriteria.length) {
        metadata.task = {
          ...metadata.task,
          qaScope: 'focused',
          qaCriteriaIds: state.pendingCriteria,
        };
        writeFileSync(args[1], JSON.stringify(metadata));
      } else rmSync(args[1], { force: true });
    } else if (command === 'capture') {
      const [kind, log, report, applicationLog, metadataFile] = args;
      if (!['build', 'browser'].includes(kind))
        throw new Error('Invalid failure kind.');
      const context = path.join(path.dirname(file), 'repair-context');
      mkdirSync(context, { recursive: true });
      for (const [index, source] of [log, report, applicationLog].entries()) {
        const target = path.join(context, contextFiles[index]);
        if (source && existsSync(source)) {
          const data = readFileSync(source, 'utf8');
          writeFileSync(target, index === 1 ? data : data.slice(-64_000));
        } else rmSync(target, { force: true });
      }
      state.phase = 'repair';
      state.failureKind = kind;
      if (metadataFile) {
        const root = path.dirname(file);
        const text = existsSync(log) ? readFileSync(log, 'utf8') : '';
        const reportValue = report && existsSync(report) ? json(report) : null;
        const stageFile = path.join(root, 'last-failed-stage');
        // verify.sh writes the stage before each step that can fail it and
        // clears it after the database step, so a missing file is a failure
        // after that point. Never fall back to an earlier round's stage: the
        // fingerprint would change every round and hide a repeated failure.
        const stage = existsSync(stageFile)
          ? readFileSync(stageFile, 'utf8').trim()
          : kind === 'browser'
            ? 'browser'
            : 'build';
        state.failureStage = stage;
        const repeated = recordFailures(
          state,
          observedFailures(kind, reportValue, text, json(metadataFile), stage),
          {
            log: path.relative(root, log),
            report: reportValue ? path.relative(root, report) : null,
            repairLog: state.repairAttempts
              ? 'agent-repair-' + state.repairAttempts + '.jsonl'
              : null,
          },
        );
        if (repeated) {
          stopPipeline(
            file,
            state,
            '同一验收项 / 检查的相同失败已出现 3 次（首次失败及两次修复后仍失败）；停止自动修复。',
            'repeated-failure',
          );
          process.exit(76);
        }
      }
      saveState(file, state);
    } else if (command === 'failure-kind') {
      console.log(state.failureKind);
    } else throw new Error('Unknown pipeline-state command.');
  }
}

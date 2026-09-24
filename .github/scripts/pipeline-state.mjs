import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const phases = ['implementation', 'verify', 'repair', 'qa-focused', 'qa-full', 'done'];
const contextFiles = ['verification.log', 'report.json', 'application.log'];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));

export function inputHash(metadata) {
  const task = metadata.task ?? {};
  return hash(JSON.stringify({
    issue: metadata.issue?.number,
    targetBranch: task.targetBranch,
    taskType: task.taskType,
    requirements: task.requirements,
    acceptanceCriteria: task.acceptanceCriteria,
    sampleData: task.sampleData,
    ...(task.buildReviewMode ? { buildReviewMode: task.buildReviewMode } : {}),
  }));
}

export function readState(file) {
  const state = json(file);
  if (state.version !== 1 || !phases.includes(state.phase) ||
      !/^[a-f0-9]{64}$/u.test(state.inputHash) ||
      !['verificationAttempts', 'repairAttempts'].every((key) => Number.isSafeInteger(state[key]) && state[key] >= 0) ||
      !Array.isArray(state.pendingCriteria) || state.pendingCriteria.some((id) => typeof id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/u.test(id)) ||
      !Number.isFinite(state.fullQaSeconds) || state.fullQaSeconds < 0 ||
      !['build', 'browser'].includes(state.failureKind)) {
    throw new Error('Invalid factory pipeline checkpoint.');
  }
  return state;
}

// Trusted evaluation-plan budget, copied once into the checkpoint. Handoffs,
// new attempts and recoveries restore it instead of re-reading any input.
export function normalizeBudget(value) {
  if (value == null) return null;
  const valid = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
  if (!valid(value.maxRepairAttempts, 0, 10) || !valid(value.maxActiveSeconds, 600, 86_400) || !valid(value.maxContinuations, 0, 10))
    throw new Error('Invalid evaluation sample budget.');
  return { maxRepairAttempts: value.maxRepairAttempts, maxActiveSeconds: value.maxActiveSeconds, maxContinuations: value.maxContinuations };
}
// Active time excludes queueing: previous jobs' total plus this job since it started.
export function activeSeconds(state, now = Date.now() / 1000) {
  const started = Number(process.env.FACTORY_JOB_STARTED_EPOCH_SECONDS);
  const base = Number.isSafeInteger(state.activeSecondsBase) ? state.activeSecondsBase : 0;
  return Number.isSafeInteger(started) && started > 0 ? base + Math.max(0, Math.floor(now - started)) : state.activeSeconds ?? base;
}
const minimumFor = (state, phase) => phase === 'qa-full'
  ? Math.max(900, Math.min(10_800, Math.ceil((state.fullQaSeconds || 0) * 1.1)))
  : phase === 'verify' ? 120 : 300;
export const ARCHIVE_RESERVE_SECONDS = 300;
export function budgetExhausted(state, phase, now = Date.now() / 1000) {
  const budget = state.budget;
  if (!budget) return null;
  if (phase === 'repair' && state.repairAttempts >= budget.maxRepairAttempts) return `工厂修复次数已达上限 ${budget.maxRepairAttempts}`;
  const remaining = budget.maxActiveSeconds - activeSeconds(state, now) - ARCHIVE_RESERVE_SECONDS;
  if (phase && remaining < minimumFor(state, phase)) return `剩余主动执行时间不足以开始 ${phase}（预算 ${budget.maxActiveSeconds} 秒）`;
  return null;
}

export function saveState(file, state) {
  if (state.budget) state.activeSeconds = activeSeconds(state);
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, file);
  // Public progress has no prompts, observations, credentials or source logs.
  const progressPath = path.join(path.dirname(file), 'progress.json');
  let previous;
  try { previous = json(progressPath); } catch { /* First progress sample. */ }
  const now = Date.now();
  const samePhase = previous?.runId === (process.env.GITHUB_RUN_ID ?? '') &&
    previous?.attempt === (process.env.GITHUB_RUN_ATTEMPT ?? '') &&
    previous?.phase === state.phase && previous?.verificationAttempts === state.verificationAttempts &&
    previous?.repairAttempts === state.repairAttempts;
  const progress = {
    runId: process.env.GITHUB_RUN_ID ?? '',
    attempt: process.env.GITHUB_RUN_ATTEMPT ?? '',
    updatedAt: now,
    phaseStartedAt: samePhase && Number.isSafeInteger(previous.phaseStartedAt) ? previous.phaseStartedAt : now,
    phase: state.phase,
    outcome: state.outcome ?? 'running',
    verificationAttempts: state.verificationAttempts,
    repairAttempts: state.repairAttempts,
    pendingCriteria: state.pendingCriteria,
  };
  writeFileSync(`${progressPath}.tmp`, `${JSON.stringify(progress, null, 2)}\n`);
  renameSync(`${progressPath}.tmp`, progressPath);
  const message = `Factory phase: ${state.phase} (${state.outcome ?? 'running'}); verification ${state.verificationAttempts}; repair ${state.repairAttempts}; pending ${state.pendingCriteria.join(', ') || 'none'}`;
  console.error(message);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n\n`);
}

export function initialize(file, metadata) {
  if (existsSync(file)) {
    const state = readState(file);
    if (state.inputHash !== inputHash(metadata))
      throw new Error('Checkpoint belongs to different business input; start a new build instead of resuming it.');
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
    ...(metadata.evaluation?.budget ? { budget: normalizeBudget(metadata.evaluation.budget), activeSeconds: 0, activeSecondsBase: 0 } : {}),
  };
  saveState(file, state);
  return state;
}

export function restoreState(source, destination, metadata) {
  const file = path.join(destination, 'pipeline-state.json');
  const saved = path.join(source, 'pipeline-state.json');
  if (!existsSync(saved)) {
    console.error('Legacy handoff: no stage checkpoint; rebuilding and running full QA.');
    return initialize(file, metadata);
  }
  const state = readState(saved);
  if (state.inputHash !== inputHash(metadata)) throw new Error('Checkpoint business input has changed.');
  if (!state.patchHash || hash(readFileSync(path.join(source, 'agent.patch'))) !== state.patchHash)
    throw new Error('Checkpoint patch hash does not match the restored code.');
  if (state.controlSha && process.env.FACTORY_CONTROL_SHA && state.controlSha !== process.env.FACTORY_CONTROL_SHA) {
    throw new Error('Checkpoint factory SHA differs from the selected control plane; resume with its pinned SHA instead of restarting QA.');
  }
  state.controlSha = process.env.FACTORY_CONTROL_SHA ?? state.controlSha;
  state.outcome = 'running';
  if (state.budget) {
    state.budget = normalizeBudget(state.budget);
    state.activeSecondsBase = Number.isSafeInteger(state.activeSeconds) ? state.activeSeconds : 0;
  }
  mkdirSync(destination, { recursive: true });
  const context = path.join(destination, 'repair-context');
  mkdirSync(context, { recursive: true });
  for (const name of contextFiles) {
    const from = path.join(source, 'repair-context', name);
    const to = path.join(context, name);
    if (existsSync(from)) copyFileSync(from, to);
    else rmSync(to, { force: true });
  }
  if (state.phase === 'repair' && !existsSync(path.join(context, 'verification.log')))
    throw new Error('Repair checkpoint is missing its diagnostic context.');
  // Process/browser/DB state is not restored. Full QA always starts clean;
  // a report-only interruption resumes its QA scope, never stale browser state.
  saveState(file, state);
  return state;
}

export function canStart(state, phase, deadline, now = Date.now() / 1000) {
  if (!deadline) return true;
  if (!Number.isSafeInteger(Number(deadline)) || Number(deadline) <= 0)
    throw new Error('Invalid runner deadline.');
  return Number(deadline) - now >= minimumFor(state, phase);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, file, ...args] = process.argv.slice(2);
  if (command === 'restore') {
    restoreState(file, args[0], json(args[1]));
  } else if (command === 'init') {
    initialize(file, json(args[0]));
  } else {
    const state = readState(file);
    if (command === 'read') {
      console.log(`${state.phase} ${state.verificationAttempts} ${state.repairAttempts}`);
    } else if (command === 'phase') {
      console.log(state.phase);
    } else if (command === 'budget') {
      // 76: the trusted evaluation budget is spent (terminal); 75: runner time only (handoff).
      const exhausted = budgetExhausted(state, args[0]);
      if (exhausted) { console.error(`Evaluation budget exhausted: ${exhausted}`); process.exit(76); }
      if (!canStart(state, args[0], process.env.FACTORY_RUN_DEADLINE_EPOCH_SECONDS)) process.exit(75);
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
      if (!['running', 'passed', 'failed', 'blocked', 'handoff', 'budget-exhausted'].includes(args[0])) throw new Error('Unknown pipeline outcome.');
      state.outcome = args[0];
      saveState(file, state);
    } else if (command === 'focus') {
      const focus = existsSync(args[0]) ? json(args[0]) : null;
      state.pendingCriteria = focus?.task?.qaCriteriaIds ?? [];
      saveState(file, state);
    } else if (command === 'metadata') {
      const metadata = json(args[0]);
      if (state.pendingCriteria.length) {
        metadata.task = { ...metadata.task, qaScope: 'focused', qaCriteriaIds: state.pendingCriteria };
        writeFileSync(args[1], JSON.stringify(metadata));
      } else rmSync(args[1], { force: true });
    } else if (command === 'capture') {
      const [kind, log, report, applicationLog] = args;
      if (!['build', 'browser'].includes(kind)) throw new Error('Invalid failure kind.');
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
      saveState(file, state);
    } else if (command === 'failure-kind') {
      console.log(state.failureKind);
    } else throw new Error('Unknown pipeline-state command.');
  }
}

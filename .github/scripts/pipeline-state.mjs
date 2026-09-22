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

export function saveState(file, state) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, file);
  // Public progress has no prompts, observations, credentials or source logs.
  const progress = {
    phase: state.phase,
    outcome: state.outcome ?? 'running',
    verificationAttempts: state.verificationAttempts,
    repairAttempts: state.repairAttempts,
    pendingCriteria: state.pendingCriteria,
  };
  writeFileSync(path.join(path.dirname(file), 'progress.json'), `${JSON.stringify(progress, null, 2)}\n`);
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
    // A new evaluator cannot accept an old evaluator's conclusions.
    if (state.phase !== 'implementation') state.phase = 'verify';
    state.pendingCriteria = [];
    console.error('Factory control plane changed; invalidating prior QA progress.');
  }
  state.controlSha = process.env.FACTORY_CONTROL_SHA ?? state.controlSha;
  state.outcome = 'running';
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
  const minimum = phase === 'qa-full'
    ? Math.max(900, Math.min(10_800, Math.ceil((state.fullQaSeconds || 0) * 1.1)))
    : phase === 'verify' ? 120 : 300;
  return Number(deadline) - now >= minimum;
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
      if (!['running', 'passed', 'failed', 'blocked', 'handoff'].includes(args[0])) throw new Error('Unknown pipeline outcome.');
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

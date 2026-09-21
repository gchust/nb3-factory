// Lifecycle shared by every reviewed Code Agent adapter: spawn, JSONL capture,
// secret redaction, idle and invocation watchdogs, runner-budget handoff and the
// completed-invocation grace period. Adapters stay responsible for their own
// configuration files, argv, environment and event filtering, so an engine's
// specifics never leak into another adapter's security behavior.
import { spawn } from 'node:child_process';
import {
  createWriteStream,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import { clearTimeout, setTimeout } from 'node:timers';

const COMPLETION_GRACE_MILLISECONDS = 3_000;
const FORCE_KILL_DELAY_MILLISECONDS = 5_000;

export function parseAgentArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    parsed[argv[index]?.replace(/^--/, '')] = argv[index + 1];
  }
  for (const name of ['workspace', 'prompt', 'log', 'agentDir']) {
    if (!parsed[name]) throw new Error(`Missing --${name}`);
  }
  return {
    workspace: path.resolve(parsed.workspace),
    prompt: path.resolve(parsed.prompt),
    log: path.resolve(parsed.log),
    agentDir: path.resolve(parsed.agentDir),
  };
}

export function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function parseInvocationTimeout(value, fallback) {
  if (value == null || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 21_600) {
    throw new Error(
      'CODE_AGENT_INVOCATION_TIMEOUT_SECONDS must be an integer from 0 to 21600 (0 disables the timeout).',
    );
  }
  return parsed;
}

export function parseIdleTimeout(value, fallback) {
  if (value == null || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 21_600) {
    throw new Error(
      'CODE_AGENT_IDLE_TIMEOUT_SECONDS must be an integer from 0 to 21600 (0 disables the idle watchdog).',
    );
  }
  return parsed;
}

export function parseRunDeadline(value) {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      'FACTORY_RUN_DEADLINE_EPOCH_SECONDS must be a positive integer.',
    );
  }
  return parsed;
}

export function buildRedactor(secrets) {
  const known = secrets.filter(Boolean);
  return (text) =>
    known.reduce((out, secret) => out.replaceAll(secret, '[REDACTED]'), text);
}

/**
 * Run one non-interactive agent invocation.
 *
 * `label` names the engine in diagnostics only. `isCompletionEvent` arms a short
 * grace period after the engine reports completion, because a stream that stays
 * open after a finished turn would otherwise hold the runner until its budget
 * expires. `formatConsoleLine` filters the Actions log; it never affects the
 * JSONL artifact, which keeps every line for usage accounting and history.
 */
export async function runAgentInvocation({
  label,
  command,
  args,
  cwd,
  env,
  log,
  secrets = [],
  standardInput,
  invocationTimeoutSeconds = 0,
  idleTimeoutSeconds = 0,
  runDeadlineEpochSeconds = null,
  completionGraceMilliseconds = COMPLETION_GRACE_MILLISECONDS,
  isCompletionEvent = () => false,
  getEventFailure = () => undefined,
  formatConsoleLine = (line) => line,
}) {
  const redact = buildRedactor(secrets);
  mkdirSync(path.dirname(log), { recursive: true });

  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== 'win32',
    env,
    stdio: [standardInput === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  });

  const stream = createWriteStream(log, { flags: 'w', mode: 0o600 });
  let stdoutBuffer = '';
  let eventFailure;
  let timedOut = false;
  let stalled = false;
  let handoffRequested = false;
  let forceKillTimer;
  let completionTimer;
  let completionTermination = false;
  let invocationTimer;
  let idleTimer;
  let handoffTimer;

  child.stdout.on('data', (chunk) => {
    recordActivity();
    stream.write(chunk);
    stdoutBuffer += chunk.toString('utf8');
    const lines = stdoutBuffer.split(/\r?\n/u);
    stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) {
      observeAgentEvent(line);
      writeConsoleAgentEvent(line);
    }
  });
  child.stdout.on('end', () => {
    if (!stdoutBuffer) return;
    observeAgentEvent(stdoutBuffer);
    writeConsoleAgentEvent(stdoutBuffer);
    stdoutBuffer = '';
  });
  child.stderr.on('data', (chunk) => {
    recordActivity();
    process.stderr.write(redact(chunk.toString('utf8')));
    stream.write(chunk);
  });

  if (standardInput !== undefined) {
    child.stdin.on('error', () => {}); // The engine may exit before reading it.
    child.stdin.end(standardInput);
  }

  recordActivity();
  if (invocationTimeoutSeconds > 0) {
    invocationTimer = setTimeout(() => {
      timedOut = true;
      process.stderr.write(
        `${label} invocation timed out after ${invocationTimeoutSeconds} seconds.\n`,
      );
      terminateChild('SIGTERM');
      forceKillTimer = setTimeout(
        () => terminateChild('SIGKILL'),
        FORCE_KILL_DELAY_MILLISECONDS,
      );
    }, invocationTimeoutSeconds * 1_000);
  }
  if (runDeadlineEpochSeconds != null) {
    const remainingMilliseconds = Math.max(
      0,
      runDeadlineEpochSeconds * 1_000 - Date.now(),
    );
    handoffTimer = setTimeout(() => {
      handoffRequested = true;
      process.stderr.write(
        `Factory runner budget reached; stopping ${label} so the workspace can be handed off to another Actions run.\n`,
      );
      terminateChild('SIGTERM');
      forceKillTimer = setTimeout(
        () => terminateChild('SIGKILL'),
        FORCE_KILL_DELAY_MILLISECONDS,
      );
    }, remainingMilliseconds);
  }

  let exitCode = 0;
  let invocationError;
  try {
    exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
  } catch (error) {
    invocationError = error;
  } finally {
    clearTimeout(invocationTimer);
    clearTimeout(idleTimer);
    clearTimeout(handoffTimer);
    clearTimeout(forceKillTimer);
    clearTimeout(completionTimer);
    stream.end();
    // The transcript is a published artifact: it must be scrubbed on the failure
    // path too, or a crashing engine could leave a credential on disk.
    try {
      await finished(stream);
    } catch (error) {
      invocationError ??= error;
    }
    redactLog(log, redact);
  }
  if (invocationError) throw invocationError;

  if (handoffRequested) {
    process.exitCode = 75;
  } else if (timedOut) {
    throw new Error(
      `${label} invocation timed out after ${invocationTimeoutSeconds} seconds.`,
    );
  } else if (eventFailure) {
    throw new Error(
      `${label} model invocation failed: ${redact(eventFailure)}`,
    );
  } else if (!completionTermination && !stalled && exitCode !== 0) {
    throw new Error(`${label} exited with code ${exitCode}.`);
  }

  function recordActivity() {
    if (idleTimeoutSeconds <= 0 || stalled) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (handoffRequested || timedOut || completionTermination) return;
      stalled = true;
      process.stderr.write(
        `Code Agent produced no stdout/stderr activity for ${idleTimeoutSeconds} seconds; stopping the invocation so factory verification can inspect the partial workspace.\n`,
      );
      terminateChild('SIGTERM');
      forceKillTimer = setTimeout(
        () => terminateChild('SIGKILL'),
        FORCE_KILL_DELAY_MILLISECONDS,
      );
    }, idleTimeoutSeconds * 1_000);
  }

  function observeAgentEvent(line) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    const failure = getEventFailure(event);
    if (failure !== undefined) eventFailure = failure;
    if (!isCompletionEvent(event)) return;
    if (completionTimer) return;
    completionTimer = setTimeout(() => {
      completionTermination = true;
      process.stderr.write(
        `${label} emitted ${event.type} but did not exit; closing the completed invocation.\n`,
      );
      terminateChild('SIGTERM');
      forceKillTimer = setTimeout(
        () => terminateChild('SIGKILL'),
        FORCE_KILL_DELAY_MILLISECONDS,
      );
    }, completionGraceMilliseconds);
  }

  /**
   * Keep the Actions log readable while preserving the complete JSONL artifact.
   * Streaming deltas and image tool results belong in the artifact, not the log.
   */
  function writeConsoleAgentEvent(line) {
    // Redact before a formatter can truncate a credential into an unmatchable prefix.
    line = redact(line);
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      process.stdout.write(`${redact(line)}\n`);
      return;
    }
    const formatted = formatConsoleLine(line, event);
    if (formatted == null) return;
    process.stdout.write(`${redact(formatted)}\n`);
  }

  function terminateChild(signal) {
    try {
      if (child.pid && process.platform !== 'win32') {
        process.kill(-child.pid, signal);
      } else {
        child.kill(signal);
      }
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
  }
}

function redactLog(file, redact) {
  let contents;
  try {
    contents = readFileSync(file, 'utf8');
  } catch {
    return; // No transcript was produced; there is nothing to scrub.
  }
  writeFileSync(file, redact(contents), { mode: 0o600 });
}

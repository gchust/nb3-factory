import { readFileSync } from 'node:fs';
import { beginInvocation } from './agent-invocation-record.mjs';
import { recordTiming } from './timing.mjs';
import { resolveAgent } from './agent-registry.mjs';
import { credentialNames, engineEnv } from './agent-adapter.mjs';
import { createResult, readResult } from './agent-result.mjs';
import { parseAgentArgs, parseIdleTimeout, parseInvocationTimeout, parseRunDeadline, runAgentInvocation } from './agent-harness.mjs';

const started = Date.now();
const adapter = resolveAgent();
const options = parseAgentArgs(process.argv.slice(2));
const qa = process.env.FACTORY_AGENT_ROLE === 'qa';
const phase = qa
  ? options.log.includes('report-repair') ? 'qa-report-repair' : options.log.includes('browser-focused') ? 'qa-focused' : 'qa'
  : options.log.includes('comment-agent') ? 'reply' : options.log.includes('repair') ? 'repair' : 'implementation';
process.once('exit', (status) => recordTiming(`agent:${phase}`, started, status));
const env = engineEnv(process.env, adapter.credentials);
const knownSecrets = [...credentialNames.map((name) => process.env[name]),
  process.env.FACTORY_ADMIN_PASSWORD, process.env.FACTORY_TEST_PASSWORD];
const capture = beginInvocation({ ...options, engine: adapter.id, phase, secrets: knownSecrets });
let invocationError;
try {
  const invocation = adapter.createInvocation({ ...options, env });
  let actualVersion = null;
  let configuredVersion = adapter.version;
  if (process.env.FACTORY_AGENT_INSTALL_RECORD) {
    const installed = JSON.parse(readFileSync(process.env.FACTORY_AGENT_INSTALL_RECORD, 'utf8'));
    if (installed.engine !== adapter.id) throw new Error('Installed agent does not match selected engine.');
    actualVersion = installed.actualVersion;
    configuredVersion = installed.configuredVersion;
  }
  // Validate before marking an invocation started; invalid settings never spawn the CLI.
  const invocationTimeoutSeconds = parseInvocationTimeout(process.env.CODE_AGENT_INVOCATION_TIMEOUT_SECONDS, 0);
  const idleTimeoutSeconds = parseIdleTimeout(process.env.CODE_AGENT_IDLE_TIMEOUT_SECONDS, 600);
  const runDeadlineEpochSeconds = parseRunDeadline(process.env.FACTORY_RUN_DEADLINE_EPOCH_SECONDS);
  capture.start({ ...invocation, actualVersion, configuredVersion });
  await runAgentInvocation({
    ...invocation,
    log: options.log,
    parseEvent: adapter.parseEvent,
    result: createResult({ engine: adapter.id, configuredVersion, actualVersion,
      model: invocation.model, completion: adapter.completion ?? 'event', phase, role: qa ? 'qa' : phase === 'reply' ? 'reply' : 'implementation' }),
    secrets: [...(invocation.secrets ?? []), ...credentialNames.map((name) => process.env[name]),
      process.env.FACTORY_ADMIN_PASSWORD, process.env.FACTORY_TEST_PASSWORD],
    invocationTimeoutSeconds, idleTimeoutSeconds, runDeadlineEpochSeconds,
  });
  // Implementation can yield a partial workspace to verification. A read-only reply
  // has no such verifier: a stalled invocation must not publish a partial answer.
  if (phase === 'reply' && readResult(options.log)?.status !== 'completed') {
    throw new Error('Comment Agent did not complete; partial reply retained only in diagnostics.');
  }
} catch (error) {
  invocationError = error;
  throw error;
} finally {
  capture.finish(invocationError);
}

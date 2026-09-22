// Small helpers shared by adapters; vendor policy remains in each adapter.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const credentialNames = [
  'CODE_AGENT_API_KEY', 'CODE_AGENT_API_ENDPOINT', 'PI_API_KEY', 'PI_API_ENDPOINT',
  'CODEBUDDY_AUTH_TOKEN', 'CODEBUDDY_API_KEY', 'CODEBUDDY_BASE_URL',
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_OAUTH_TOKEN', 'CODEX_API_KEY', 'CODEX_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_BASE_URL',
  'OPENCODE_API_KEY', 'OPENCODE_BASE_URL',
];

// Keep ordinary runner/browser variables, but never lend one engine another's
// credentials. Empty Actions secrets must behave as absent variables.
export function engineEnv(source, allowed) {
  const env = { ...source };
  for (const name of credentialNames) {
    if (!allowed.includes(name) || !env[name]?.trim()) delete env[name];
  }
  return env;
}

export function npmInstall(installation, version) {
  return [{
    command: 'npm',
    args: ['install', '--global',
      ...(installation.ignoreScripts ? ['--ignore-scripts'] : []),
      `${installation.package}@${version}`],
  }];
}

export function requiredModel(name, env) {
  const value = env[name]?.trim();
  if (!value || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)) {
    throw new Error(`${name} is required and must be a model ID.`);
  }
  return value;
}

export function optionalEndpoint(value, name) {
  if (!value?.trim()) return undefined;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${name} must be an HTTP(S) URL without embedded credentials.`);
  }
  return value.trim();
}

export function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

export function shellQuote(value) {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

export function qaHooks() {
  return { PreToolUse: [{ matcher: 'Bash', hooks: [{
    type: 'command',
    command: `${shellQuote(process.execPath)} ${shellQuote(fileURLToPath(
      new URL('./agents/pre-tool-use-qa-guard.mjs', import.meta.url),
    ))}`,
  }] }] };
}

// Claude-style result events contain invocation-cumulative usage. Assistant
// snapshots and stream deltas must never be counted in addition to this result.
export function resultEvent(event) {
  if (event.type !== 'result') return undefined;
  const failed = event.is_error === true || event.subtype?.startsWith('error');
  const usage = event.usage;
  return {
    complete: true,
    failure: failed ? (event.errors?.join('; ') || event.result || 'Agent reported a failed result') : null,
    measurements: [{ id: 'invocation', usage: usage && {
      input: usage.input_tokens,
      output: usage.output_tokens,
      cacheRead: usage.cache_read_input_tokens,
      cacheWrite: usage.cache_creation_input_tokens,
    } }],
  };
}

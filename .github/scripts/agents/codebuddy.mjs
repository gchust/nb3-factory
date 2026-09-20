// CodeBuddy Code engine. It reads only the CODEBUDDY_* namespace: a Pi API key,
// endpoint or model left in the environment must never reach this process.
//
// The workspace holding the generated application is untrusted input. The CLI is
// therefore pointed at a factory-owned config directory and told to load only
// user-scope settings, so a `.codebuddy/settings.json` shipped by the application
// (which may contain hooks) can never execute with the credential in env.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseAgentArgs,
  parseIdleTimeout,
  parseInvocationTimeout,
  parseRunDeadline,
  requiredEnv,
  runAgentInvocation,
} from '../agent-harness.mjs';

const { workspace, prompt, log, agentDir } = parseAgentArgs(
  process.argv.slice(2),
);
// The CLI prefers an OAuth bearer token over an API key; accept either so an
// individual subscription key and an enterprise OAuth token both work.
const authToken = process.env.CODEBUDDY_AUTH_TOKEN?.trim();
const apiKey = process.env.CODEBUDDY_API_KEY?.trim();
if (!authToken && !apiKey) {
  throw new Error(
    'CODEBUDDY_AUTH_TOKEN or CODEBUDDY_API_KEY is required. The China service also needs CODEBUDDY_INTERNET_ENVIRONMENT=internal with an API key.',
  );
}
const model = requiredEnv('CODEBUDDY_MODEL');
if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(model)) {
  throw new Error(
    'CODEBUDDY_MODEL must be a model ID, not a flag or an empty value.',
  );
}
const thinkingLevel = process.env.CODEBUDDY_THINKING?.trim() || 'max';
const supportedThinking = new Set([
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);
if (!supportedThinking.has(thinkingLevel)) {
  throw new Error(`Unsupported CODEBUDDY_THINKING: ${thinkingLevel}`);
}
const invocationTimeoutSeconds = parseInvocationTimeout(
  process.env.CODE_AGENT_INVOCATION_TIMEOUT_SECONDS,
  0,
);
const idleTimeoutSeconds = parseIdleTimeout(
  process.env.CODE_AGENT_IDLE_TIMEOUT_SECONDS,
  600,
);
const runDeadlineEpochSeconds = parseRunDeadline(
  process.env.FACTORY_RUN_DEADLINE_EPOCH_SECONDS,
);
const isQa = process.env.FACTORY_AGENT_ROLE === 'qa';

mkdirSync(agentDir, { recursive: true });
const settingsPath = path.join(agentDir, 'settings.json');
writeFileSync(
  settingsPath,
  `${JSON.stringify(
    {
      permissions: { defaultMode: 'bypassPermissions' },
      // No interactive trust prompt can be answered on a runner.
      trustAll: true,
      trustedDirectories: [workspace],
      ...(isQa
        ? {
            hooks: {
              PreToolUse: [
                {
                  matcher: 'Bash',
                  hooks: [
                    {
                      type: 'command',
                      command: `node ${shellQuote(
                        fileURLToPath(
                          new URL('./codebuddy-qa-guard.mjs', import.meta.url),
                        ),
                      )}`,
                    },
                  ],
                },
              ],
            },
          }
        : {}),
    },
    null,
    2,
  )}\n`,
);

const env = {
  ...process.env,
  ...(authToken ? { CODEBUDDY_AUTH_TOKEN: authToken } : {}),
  ...(apiKey ? { CODEBUDDY_API_KEY: apiKey } : {}),
  CODEBUDDY_CONFIG_DIR: agentDir,
  DISABLE_TELEMETRY: '1',
  DISABLE_AUTOUPDATER: '1',
  CODEBUDDY_DISABLE_AUTO_MEMORY: '1',
  CODEBUDDY_DISABLE_CRON: '1',
  CODEBUDDY_CODE_DISABLE_BACKGROUND_TASKS: '1',
};
// An unset Secret or Variable arrives as an empty string. The CLI must see it as
// unset: an empty higher-priority credential would otherwise shadow the one that
// is configured.
for (const name of [
  'CODEBUDDY_AUTH_TOKEN',
  'CODEBUDDY_API_KEY',
  'CODEBUDDY_BASE_URL',
  'CODEBUDDY_INTERNET_ENVIRONMENT',
]) {
  if (!env[name]?.trim()) delete env[name];
}
// Keep the engines' credentials apart even when both are present locally.
for (const name of [
  'CODE_AGENT_API_KEY',
  'CODE_AGENT_API_ENDPOINT',
  'CODE_AGENT_API_TYPE',
  'CODE_AGENT_AUTH_HEADER',
  'PI_API_KEY',
  'PI_API_ENDPOINT',
  'PI_CODING_AGENT_DIR',
]) {
  delete env[name];
}

const STREAM_DELTA_TYPES = new Set([
  'stream_event',
  'message_update',
  'message_delta',
  'content_block_delta',
]);
const MAX_CONSOLE_LINE_CHARS = 16 * 1024;

await runAgentInvocation({
  label: 'CodeBuddy',
  command: 'codebuddy',
  args: [
    '--print',
    '--output-format',
    'stream-json',
    '--model',
    model,
    ...(thinkingLevel === 'off' ? [] : ['--effort', thinkingLevel]),
    // `--permission-mode` only applies to TUI/Web/ACP; print mode needs `-y`.
    '-y',
    '--no-session-persistence',
    '--setting-sources',
    'user',
    '--settings',
    settingsPath,
  ],
  cwd: workspace,
  env,
  log,
  secrets: [
    authToken,
    apiKey,
    process.env.FACTORY_ADMIN_PASSWORD,
    process.env.FACTORY_TEST_PASSWORD,
  ],
  standardInput: readFileSync(prompt, 'utf8'),
  invocationTimeoutSeconds,
  idleTimeoutSeconds,
  runDeadlineEpochSeconds,
  isCompletionEvent: (event) => event.type === 'result',
  formatConsoleLine,
});

/**
 * Keep actual text and tool payloads visible in Actions. Only duplicate streaming
 * deltas and binary data are omitted; the artifact retains the complete events.
 * The harness redacts secrets before formatting so truncation cannot expose them.
 */
function formatConsoleLine(line, event) {
  if (STREAM_DELTA_TYPES.has(event.type)) return null;
  const formatted = JSON.stringify(consoleValue(event));
  if (formatted.length <= MAX_CONSOLE_LINE_CHARS) return formatted;
  return `${formatted.slice(0, MAX_CONSOLE_LINE_CHARS)}…[truncated; full event in JSONL artifact]`;
}

function consoleValue(value) {
  if (typeof value === 'string') {
    const text = value.replaceAll(
      /data:[^\s;,"']+;base64,[A-Za-z0-9+/=]+/gu,
      '[base64 data omitted]',
    );
    return text.length > 8_192
      ? `${text.slice(0, 8_192)}…[truncated ${text.length} chars; full content in JSONL artifact]`
      : text;
  }
  if (Array.isArray(value)) return value.map(consoleValue);
  if (!value || typeof value !== 'object') return value;
  if (value.type === 'base64') {
    return {
      type: value.type,
      media_type: value.media_type,
      data: '[base64 data omitted]',
    };
  }
  // Images may also use URL sources; omit the binary payload at any nesting
  // depth, including images inside a tool_result content array.
  if (value.type === 'image') {
    return {
      type: value.type,
      mediaType: value.source?.media_type,
      omitted: true,
    };
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, consoleValue(item)]),
  );
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

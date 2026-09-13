// CodeBuddy Code engine. It reads only the CODEBUDDY_* namespace: a Pi API key,
// endpoint or model left in the environment must never reach this process.
//
// The workspace holding the generated application is untrusted input. The CLI is
// therefore pointed at a factory-owned config directory and told to load only
// user-scope settings, so a `.codebuddy/settings.json` shipped by the application
// (which may contain hooks) can never execute with the subscription token in env.
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
const authToken = requiredEnv('CODEBUDDY_AUTH_TOKEN');
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
  CODEBUDDY_AUTH_TOKEN: authToken,
  CODEBUDDY_CONFIG_DIR: agentDir,
  DISABLE_TELEMETRY: '1',
  DISABLE_AUTOUPDATER: '1',
  CODEBUDDY_DISABLE_AUTO_MEMORY: '1',
  CODEBUDDY_DISABLE_CRON: '1',
  CODEBUDDY_CODE_DISABLE_BACKGROUND_TASKS: '1',
};
// An unset Variable arrives as an empty string; the CLI must see it as unset.
for (const name of ['CODEBUDDY_BASE_URL', 'CODEBUDDY_INTERNET_ENVIRONMENT']) {
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
 * The JSONL artifact keeps every line; the Actions log gets compact summaries,
 * because streamed deltas and base64 tool results would otherwise dominate it.
 */
function formatConsoleLine(line, event) {
  if (STREAM_DELTA_TYPES.has(event.type)) return null;
  if (event.type === 'assistant') {
    return JSON.stringify({
      type: event.type,
      role: event.message?.role,
      model: event.message?.model,
      usage: event.message?.usage,
      content: describeContent(event.message?.content),
    });
  }
  if (event.type === 'user') {
    return JSON.stringify({
      type: event.type,
      content: describeContent(event.message?.content),
    });
  }
  if (event.type === 'system' && event.subtype === 'init') {
    return JSON.stringify({
      type: event.type,
      subtype: event.subtype,
      session_id: event.session_id,
      model: event.model,
      tools: Array.isArray(event.tools) ? event.tools.length : undefined,
    });
  }
  if (line.length <= MAX_CONSOLE_LINE_CHARS) return line;
  return `${line.slice(0, MAX_CONSOLE_LINE_CHARS)}…[truncated ${line.length} chars]`;
}

function describeContent(content) {
  if (typeof content === 'string') {
    return { chars: content.length, preview: preview(content) };
  }
  if (!Array.isArray(content)) return undefined;
  return content.map((block) => {
    if (block?.type === 'text') {
      return {
        type: 'text',
        chars: String(block.text ?? '').length,
        preview: preview(block.text),
      };
    }
    if (block?.type === 'tool_use') {
      return {
        type: 'tool_use',
        name: block.name,
        inputChars: JSON.stringify(block.input ?? null).length,
      };
    }
    if (block?.type === 'tool_result') {
      return {
        type: 'tool_result',
        toolUseId: block.tool_use_id,
        chars: JSON.stringify(block.content ?? null).length,
      };
    }
    if (block?.type === 'image') {
      return {
        type: 'image',
        mediaType: block.source?.media_type,
        dataChars: String(block.source?.data ?? '').length,
      };
    }
    return { type: block?.type ?? 'unknown' };
  });
}

function preview(text) {
  const single = String(text ?? '')
    .replaceAll(/\s+/gu, ' ')
    .trim();
  return single.length > 200 ? `${single.slice(0, 200)}…` : single;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

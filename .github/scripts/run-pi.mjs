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

import { FACTORY_PROVIDER, parseBoolean } from './factory-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const endpoint = requiredEnv('PI_API_ENDPOINT');
const apiKey = requiredEnv('PI_API_KEY');
const api = process.env.PI_API_TYPE || 'openai-completions';
const model = requiredEnv('PI_MODEL');
const thinking = process.env.PI_THINKING || 'high';
const invocationTimeoutSeconds = parsePositiveInteger(
  process.env.PI_INVOCATION_TIMEOUT_SECONDS,
  1_800,
);
const completionGraceMilliseconds = 3_000;
const normalizedModel = model.toLowerCase();
const deepseekV4Variant = normalizedModel.includes('deepseek-v4-flash')
  ? 'flash'
  : normalizedModel.includes('deepseek-v4-pro')
    ? 'pro'
    : null;
const isDeepseekV4 = api === 'openai-completions' && deepseekV4Variant != null;
const supportedApis = new Set([
  'openai-completions',
  'openai-responses',
  'anthropic-messages',
  'google-generative-ai',
]);
const supportedThinking = new Set([
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

if (!supportedApis.has(api)) throw new Error(`Unsupported PI_API_TYPE: ${api}`);
if (!supportedThinking.has(thinking))
  throw new Error(`Unsupported PI_THINKING: ${thinking}`);
const parsedEndpoint = new URL(endpoint);
if (!['http:', 'https:'].includes(parsedEndpoint.protocol)) {
  throw new Error('PI_API_ENDPOINT must use http or https.');
}

const agentDir = path.resolve(args.agentDir);
const workspace = path.resolve(args.workspace);
const prompt = path.resolve(args.prompt);
const log = path.resolve(args.log);
mkdirSync(agentDir, { recursive: true });
mkdirSync(path.dirname(log), { recursive: true });

const provider = {
  baseUrl: endpoint,
  api,
  apiKey: '$PI_API_KEY',
  authHeader: parseBoolean(process.env.PI_AUTH_HEADER, true),
  compat: {
    supportsDeveloperRole: parseBoolean(
      process.env.PI_SUPPORTS_DEVELOPER_ROLE,
      !isDeepseekV4,
    ),
    supportsReasoningEffort: parseBoolean(
      process.env.PI_SUPPORTS_REASONING_EFFORT,
      true,
    ),
    ...(isDeepseekV4
      ? {
          supportsStore: false,
          maxTokensField: 'max_tokens',
          thinkingFormat: 'deepseek',
          requiresReasoningContentOnAssistantMessages: true,
        }
      : {}),
  },
  models: [
    {
      id: model,
      name: model,
      reasoning: parseBoolean(process.env.PI_MODEL_REASONING, true),
      ...(isDeepseekV4
        ? {
            thinkingLevelMap: {
              minimal: null,
              low: deepseekV4Variant === 'flash' ? 'low' : null,
              medium: null,
              high: 'high',
              max: 'max',
            },
          }
        : {}),
    },
  ],
};

writeFileSync(
  path.join(agentDir, 'models.json'),
  `${JSON.stringify({ providers: { [FACTORY_PROVIDER]: provider } }, null, 2)}\n`,
);
writeFileSync(
  path.join(agentDir, 'settings.json'),
  `${JSON.stringify(
    {
      defaultProjectTrust: 'never',
      enableInstallTelemetry: false,
      quietStartup: true,
    },
    null,
    2,
  )}\n`,
);

const child = spawn(
  'pi',
  [
    '--mode',
    'json',
    '--no-session',
    '--approve',
    '--provider',
    FACTORY_PROVIDER,
    '--model',
    model,
    '--thinking',
    thinking,
    `@${prompt}`,
  ],
  {
    cwd: workspace,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      PI_API_KEY: apiKey,
      PI_CODING_AGENT_DIR: agentDir,
      PI_SKIP_VERSION_CHECK: '1',
      PI_TELEMETRY: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

const stream = createWriteStream(log, { flags: 'w', mode: 0o600 });
let stdoutBuffer = '';
child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  stream.write(chunk);
  stdoutBuffer += chunk.toString('utf8');
  const lines = stdoutBuffer.split(/\r?\n/u);
  stdoutBuffer = lines.pop() ?? '';
  for (const line of lines) observeAgentEvent(line);
});
child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
  stream.write(chunk);
});

let timedOut = false;
let forceKillTimer;
let completionTimer;
let completionTermination = false;
const invocationTimer = setTimeout(() => {
  timedOut = true;
  process.stderr.write(
    `Pi invocation timed out after ${invocationTimeoutSeconds} seconds.\n`,
  );
  terminateChild('SIGTERM');
  forceKillTimer = setTimeout(() => terminateChild('SIGKILL'), 5_000);
}, invocationTimeoutSeconds * 1_000);

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', resolve);
});
clearTimeout(invocationTimer);
clearTimeout(forceKillTimer);
clearTimeout(completionTimer);
stream.end();
await finished(stream);
redactLog(log, [
  apiKey,
  endpoint,
  process.env.FACTORY_ADMIN_PASSWORD,
  process.env.FACTORY_TEST_PASSWORD,
]);

if (timedOut) {
  throw new Error(
    `Pi invocation timed out after ${invocationTimeoutSeconds} seconds.`,
  );
}
if (!completionTermination && exitCode !== 0) {
  throw new Error(`Pi exited with code ${exitCode}.`);
}

function observeAgentEvent(line) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return;
  }
  if (!['agent_end', 'agent_settled'].includes(event.type)) return;
  if (completionTimer) return;
  completionTimer = setTimeout(() => {
    completionTermination = true;
    process.stderr.write(
      `Pi emitted ${event.type} but did not exit; closing the completed invocation.\n`,
    );
    terminateChild('SIGTERM');
    forceKillTimer = setTimeout(() => terminateChild('SIGKILL'), 5_000);
  }, completionGraceMilliseconds);
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

function redactLog(file, secrets) {
  let contents = readFileSync(file, 'utf8');
  for (const secret of secrets.filter(Boolean)) {
    contents = contents.replaceAll(secret, '[REDACTED]');
  }
  writeFileSync(file, contents, { mode: 0o600 });
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parsePositiveInteger(value, fallback) {
  if (value == null || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 21_600) {
    throw new Error(
      'PI_INVOCATION_TIMEOUT_SECONDS must be an integer from 1 to 21600.',
    );
  }
  return parsed;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    parsed[argv[index]?.replace(/^--/, '')] = argv[index + 1];
  }
  for (const name of ['workspace', 'prompt', 'log', 'agentDir']) {
    if (!parsed[name]) throw new Error(`Missing --${name}`);
  }
  return parsed;
}

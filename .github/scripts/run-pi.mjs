import { spawn } from 'node:child_process';
import {
  createWriteStream,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { finished } from 'node:stream/promises';

import { FACTORY_PROVIDER, parseBoolean } from './factory-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const endpoint = requiredEnv('PI_API_ENDPOINT');
const apiKey = requiredEnv('PI_API_KEY');
const api = process.env.PI_API_TYPE || 'openai-completions';
const model = requiredEnv('PI_MODEL');
const thinking = process.env.PI_THINKING || 'high';
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
      true,
    ),
    supportsReasoningEffort: parseBoolean(
      process.env.PI_SUPPORTS_REASONING_EFFORT,
      true,
    ),
  },
  models: [
    {
      id: model,
      name: model,
      reasoning: parseBoolean(process.env.PI_MODEL_REASONING, true),
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
child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  stream.write(chunk);
});
child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
  stream.write(chunk);
});

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', resolve);
});
stream.end();
await finished(stream);
redactLog(log, [apiKey, endpoint]);

if (exitCode !== 0) throw new Error(`Pi exited with code ${exitCode}.`);

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

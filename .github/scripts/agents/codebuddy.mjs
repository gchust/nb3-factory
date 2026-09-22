import { npmInstall, resultEvent, shellQuote } from '../agent-adapter.mjs';
import { formatConsoleLine } from '../agent-console.mjs';
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

import { requiredEnv } from '../agent-harness.mjs';

export function createInvocation({
  workspace, prompt, log, agentDir, env: config,
}) {
  // The CLI prefers an OAuth bearer token over an API key; accept either so an
  // individual subscription key and an enterprise OAuth token both work.
  const authToken = config.CODEBUDDY_AUTH_TOKEN?.trim();
  const apiKey = config.CODEBUDDY_API_KEY?.trim();
  if (!authToken && !apiKey) {
    throw new Error(
      'CODEBUDDY_AUTH_TOKEN or CODEBUDDY_API_KEY is required. The China service also needs CODEBUDDY_INTERNET_ENVIRONMENT=internal with an API key.',
    );
  }
  const model = requiredEnv('CODEBUDDY_MODEL', config);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(model)) {
    throw new Error(
      'CODEBUDDY_MODEL must be a model ID, not a flag or an empty value.',
    );
  }
  const thinkingLevel =
    (config.FACTORY_AGENT_ROLE === 'qa' && config.FACTORY_QA_THINKING) ||
    config.CODEBUDDY_THINKING?.trim() || 'max';
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
  const isQa = config.FACTORY_AGENT_ROLE === 'qa';

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
    ...config,
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

  return {
    model,
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
      config.FACTORY_ADMIN_PASSWORD,
      config.FACTORY_TEST_PASSWORD,
    ],
    standardInput: readFileSync(prompt, 'utf8'),
    formatConsoleLine,
  };
}

export const installation = {
  package: '@tencent-ai/codebuddy-code', version: '2.150.0',
  versionEnv: ['CODEBUDDY_VERSION'], command: 'codebuddy', ignoreScripts: true,
};
export const install = (version) => npmInstall(installation, version);
export const parseEvent = resultEvent;
export const credentials = ['CODEBUDDY_AUTH_TOKEN', 'CODEBUDDY_API_KEY', 'CODEBUDDY_BASE_URL'];

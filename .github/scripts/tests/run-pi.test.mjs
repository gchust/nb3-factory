import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = path.resolve(import.meta.dirname, '..', 'run-pi.mjs');

test('Pi runner keeps the API key indirect and redacts diagnostic artifacts', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-factory-pi-'));
  const workspace = path.join(root, 'workspace');
  const bin = path.join(root, 'bin');
  const prompt = path.join(root, 'task.md');
  const log = path.join(root, 'artifacts', 'pi.jsonl');
  const agentDir = path.join(root, 'agent');
  const endpoint = 'https://private-endpoint.example/v1';
  const apiKey = 'test-api-key-that-must-not-leak';
  const browserPassword = 'browser-password-that-must-not-leak';

  try {
    mkdirSync(workspace);
    mkdirSync(bin);
    writeFileSync(prompt, 'test task\n');
    writeFileSync(
      path.join(bin, 'pi'),
      [
        '#!/usr/bin/env node',
        'console.log(JSON.stringify({ key: process.env.PI_API_KEY, endpoint: process.env.PI_API_ENDPOINT, browserPassword: process.env.FACTORY_TEST_PASSWORD }));',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );

    execFileSync(
      process.execPath,
      [
        script,
        '--workspace',
        workspace,
        '--prompt',
        prompt,
        '--log',
        log,
        '--agentDir',
        agentDir,
      ],
      {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          PI_API_ENDPOINT: endpoint,
          PI_API_KEY: apiKey,
          PI_API_TYPE: 'openai-completions',
          PI_MODEL: 'test-model',
          FACTORY_TEST_PASSWORD: browserPassword,
        },
        stdio: 'pipe',
      },
    );

    const diagnostics = readFileSync(log, 'utf8');
    assert.doesNotMatch(diagnostics, new RegExp(apiKey));
    assert.doesNotMatch(diagnostics, new RegExp(endpoint));
    assert.doesNotMatch(diagnostics, new RegExp(browserPassword));
    assert.match(diagnostics, /\[REDACTED\]/);

    const models = JSON.parse(
      readFileSync(path.join(agentDir, 'models.json'), 'utf8'),
    );
    assert.equal(models.providers['nb3-factory'].apiKey, '$PI_API_KEY');
    assert.equal(models.providers['nb3-factory'].baseUrl, endpoint);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Pi runner applies DeepSeek V4 compatibility behind a custom proxy', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-factory-deepseek-'));
  const workspace = path.join(root, 'workspace');
  const bin = path.join(root, 'bin');
  const prompt = path.join(root, 'task.md');
  const log = path.join(root, 'artifacts', 'pi.jsonl');
  const agentDir = path.join(root, 'agent');

  try {
    mkdirSync(workspace);
    mkdirSync(bin);
    writeFileSync(prompt, 'test task\n');
    writeFileSync(
      path.join(bin, 'pi'),
      '#!/usr/bin/env node\nconsole.log(JSON.stringify({ ok: true }));\n',
      { mode: 0o755 },
    );

    execFileSync(
      process.execPath,
      [
        script,
        '--workspace',
        workspace,
        '--prompt',
        prompt,
        '--log',
        log,
        '--agentDir',
        agentDir,
      ],
      {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          PI_API_ENDPOINT: 'https://proxy.example/v1',
          PI_API_KEY: 'test-key',
          PI_API_TYPE: 'openai-completions',
          PI_MODEL: 'deepseek-v4-flash',
        },
        stdio: 'pipe',
      },
    );

    const models = JSON.parse(
      readFileSync(path.join(agentDir, 'models.json'), 'utf8'),
    );
    const provider = models.providers['nb3-factory'];
    const configuredModel = provider.models[0];

    assert.equal(provider.compat.supportsDeveloperRole, false);
    assert.equal(provider.compat.supportsReasoningEffort, true);
    assert.equal(provider.compat.supportsStore, false);
    assert.equal(provider.compat.maxTokensField, 'max_tokens');
    assert.equal(provider.compat.thinkingFormat, 'deepseek');
    assert.equal(
      provider.compat.requiresReasoningContentOnAssistantMessages,
      true,
    );
    assert.deepEqual(configuredModel.thinkingLevelMap, {
      minimal: null,
      low: 'low',
      medium: null,
      high: 'high',
      max: 'max',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Pi runner keeps streamed deltas and large tool results out of the Actions log', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-factory-console-'));
  const workspace = path.join(root, 'workspace');
  const bin = path.join(root, 'bin');
  const prompt = path.join(root, 'task.md');
  const log = path.join(root, 'artifacts', 'pi.jsonl');
  const agentDir = path.join(root, 'agent');

  try {
    mkdirSync(workspace);
    mkdirSync(bin);
    writeFileSync(prompt, 'test task\n');
    writeFileSync(
      path.join(bin, 'pi'),
      [
        '#!/usr/bin/env node',
        "console.log(JSON.stringify({ type: 'message_update', delta: 'hidden-stream-delta' }));",
        "console.log(JSON.stringify({ type: 'tool_execution_start', toolCallId: '1', toolName: 'read' }));",
        "console.log(JSON.stringify({ type: 'tool_execution_end', toolCallId: '1', toolName: 'read', result: 'hidden-large-result', isError: false }));",
        "console.log(JSON.stringify({ type: 'agent_settled' }));",
        '',
      ].join('\n'),
      { mode: 0o755 },
    );

    const result = spawnSync(
      process.execPath,
      [
        script,
        '--workspace',
        workspace,
        '--prompt',
        prompt,
        '--log',
        log,
        '--agentDir',
        agentDir,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          PI_API_ENDPOINT: 'https://proxy.example/v1',
          PI_API_KEY: 'test-key',
          PI_API_TYPE: 'openai-completions',
          PI_MODEL: 'test-model',
        },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /hidden-stream-delta/);
    assert.doesNotMatch(result.stdout, /hidden-large-result/);
    assert.match(result.stdout, /tool_execution_start/);
    assert.match(result.stdout, /tool_execution_end/);
    const diagnostics = readFileSync(log, 'utf8');
    assert.match(diagnostics, /hidden-stream-delta/);
    assert.match(diagnostics, /hidden-large-result/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Pi runner bounds one invocation without limiting repair attempts', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-factory-timeout-'));
  const workspace = path.join(root, 'workspace');
  const bin = path.join(root, 'bin');
  const prompt = path.join(root, 'task.md');
  const log = path.join(root, 'artifacts', 'pi.jsonl');
  const agentDir = path.join(root, 'agent');

  try {
    mkdirSync(workspace);
    mkdirSync(bin);
    writeFileSync(prompt, 'test task\n');
    writeFileSync(
      path.join(bin, 'pi'),
      '#!/usr/bin/env node\nsetInterval(() => {}, 1_000);\n',
      { mode: 0o755 },
    );

    const startedAt = Date.now();
    const result = spawnSync(
      process.execPath,
      [
        script,
        '--workspace',
        workspace,
        '--prompt',
        prompt,
        '--log',
        log,
        '--agentDir',
        agentDir,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          PI_API_ENDPOINT: 'https://proxy.example/v1',
          PI_API_KEY: 'test-key',
          PI_API_TYPE: 'openai-completions',
          PI_MODEL: 'test-model',
          PI_INVOCATION_TIMEOUT_SECONDS: '1',
        },
        timeout: 5_000,
      },
    );

    assert.notEqual(result.status, 0);
    assert.ok(Date.now() - startedAt < 4_000);
    assert.match(result.stderr, /timed out after 1 seconds/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Pi runner closes a completed invocation whose stream stays open', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-factory-settled-'));
  const workspace = path.join(root, 'workspace');
  const bin = path.join(root, 'bin');
  const prompt = path.join(root, 'task.md');
  const log = path.join(root, 'artifacts', 'pi.jsonl');
  const agentDir = path.join(root, 'agent');

  try {
    mkdirSync(workspace);
    mkdirSync(bin);
    writeFileSync(prompt, 'test task\n');
    writeFileSync(
      path.join(bin, 'pi'),
      [
        '#!/usr/bin/env node',
        "console.log(JSON.stringify({ type: 'agent_end' }));",
        'setInterval(() => {}, 1_000);',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );

    const startedAt = Date.now();
    const result = spawnSync(
      process.execPath,
      [
        script,
        '--workspace',
        workspace,
        '--prompt',
        prompt,
        '--log',
        log,
        '--agentDir',
        agentDir,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          PI_API_ENDPOINT: 'https://proxy.example/v1',
          PI_API_KEY: 'test-key',
          PI_API_TYPE: 'openai-completions',
          PI_MODEL: 'test-model',
          PI_INVOCATION_TIMEOUT_SECONDS: '30',
        },
        timeout: 8_000,
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.ok(Date.now() - startedAt < 7_000);
    assert.match(result.stderr, /closing the completed invocation/);
    assert.match(readFileSync(log, 'utf8'), /agent_end/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

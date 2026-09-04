import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

  try {
    mkdirSync(workspace);
    mkdirSync(bin);
    writeFileSync(prompt, 'test task\n');
    writeFileSync(
      path.join(bin, 'pi'),
      [
        '#!/usr/bin/env node',
        'console.log(JSON.stringify({ key: process.env.PI_API_KEY, endpoint: process.env.PI_API_ENDPOINT }));',
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
        },
        stdio: 'pipe',
      },
    );

    const diagnostics = readFileSync(log, 'utf8');
    assert.doesNotMatch(diagnostics, new RegExp(apiKey));
    assert.doesNotMatch(diagnostics, new RegExp(endpoint));
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

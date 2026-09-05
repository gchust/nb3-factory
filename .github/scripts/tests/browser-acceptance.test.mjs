import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const scripts = path.resolve(import.meta.dirname, '..');
const browserAcceptance = path.join(scripts, 'browser-acceptance.sh');

test('browser acceptance starts the app and records real wrapped commands', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-browser-acceptance-'));
  const control = path.join(root, 'control');
  const controlScripts = path.join(control, '.github', 'scripts');
  const controlPrompts = path.join(control, '.github', 'prompts');
  const workspace = path.join(root, 'workspace');
  const bin = path.join(root, 'bin');
  const artifacts = path.join(root, 'artifacts');
  const state = path.join(root, 'state');
  const metadata = path.join(root, 'metadata.json');
  const config = path.join(root, 'config.yml');

  try {
    mkdirSync(controlScripts, { recursive: true });
    mkdirSync(controlPrompts, { recursive: true });
    mkdirSync(workspace);
    mkdirSync(bin);
    for (const file of [
      'agent-browser-wrapper.sh',
      'build-browser-prompt.mjs',
      'factory-lib.mjs',
      'validate-browser-report.mjs',
    ]) {
      copyFileSync(path.join(scripts, file), path.join(controlScripts, file));
    }
    chmodSync(path.join(controlScripts, 'agent-browser-wrapper.sh'), 0o755);
    copyFileSync(
      path.resolve(scripts, '..', 'prompts', 'browser-acceptance.md'),
      path.join(controlPrompts, 'browser-acceptance.md'),
    );

    writeExecutable(
      path.join(bin, 'pnpm'),
      [
        '#!/usr/bin/env node',
        "import http from 'node:http';",
        "if (process.argv[2] !== 'start') process.exit(2);",
        "http.createServer((_request, response) => response.end('ok')).listen(Number(process.env.APP_SERVER_PORT), '127.0.0.1');",
        '',
      ].join('\n'),
    );
    writeExecutable(
      path.join(bin, 'agent-browser'),
      '#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n',
    );
    writeExecutable(
      path.join(bin, 'google-chrome'),
      '#!/usr/bin/env bash\nexit 0\n',
    );
    writeFileSync(
      path.join(controlScripts, 'run-pi.mjs'),
      [
        "import { Buffer } from 'node:buffer';",
        "import { execFileSync } from 'node:child_process';",
        "import { mkdirSync, writeFileSync } from 'node:fs';",
        "import path from 'node:path';",
        "execFileSync('agent-browser', ['skills', 'get', 'core']);",
        "execFileSync('agent-browser', ['open', process.env.FACTORY_BROWSER_URL]);",
        "execFileSync('agent-browser', ['snapshot', '-i']);",
        "execFileSync('agent-browser', ['fill', '@e1', 'value']);",
        "const screenshot = path.join(process.env.FACTORY_BROWSER_EVIDENCE_DIR, 'criterion-1.png');",
        "execFileSync('agent-browser', ['screenshot', screenshot]);",
        'mkdirSync(process.env.FACTORY_BROWSER_EVIDENCE_DIR, { recursive: true });',
        "writeFileSync(screenshot, Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(1100)]));",
        "writeFileSync(process.env.FACTORY_BROWSER_REPORT, JSON.stringify({ passed: true, authenticated: true, summary: 'passed', checks: [{ criterion: 'Page loads', status: 'passed', actions: ['opened and interacted'], evidence: ['page responded'], screenshots: ['criterion-1.png'] }], failures: [] }));",
        '',
      ].join('\n'),
    );
    writeFileSync(
      metadata,
      JSON.stringify({
        issue: { number: 2, title: 'Browser test' },
        task: {
          taskType: '创建新系统',
          sampleData: '是',
          requirements: 'The page must load.',
          acceptanceCriteria: '1. Page loads',
        },
      }),
    );
    writeFileSync(config, 'test: true\n');

    execFileSync(
      browserAcceptance,
      [control, workspace, metadata, config, artifacts, state, '1'],
      {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          GITHUB_RUN_ID: '123',
        },
        stdio: 'pipe',
      },
    );

    const commands = readFileSync(
      path.join(artifacts, 'agent-browser-commands.log'),
      'utf8',
    );
    assert.match(commands, /open/);
    assert.match(commands, /snapshot/);
    assert.match(commands, /fill/);
    assert.match(commands, /screenshot/);
    assert.equal(
      JSON.parse(readFileSync(path.join(artifacts, 'report.json'), 'utf8'))
        .passed,
      true,
    );
    const renderedPrompt = readFileSync(
      path.join(state, 'browser-acceptance.md'),
      'utf8',
    );
    assert.match(renderedPrompt, /完整重新加载应用/u);
    assert.match(renderedPrompt, /管理员的前端权限缓存/u);
    assert.match(renderedPrompt, /不要再用 Pi 的 `read` 工具读取 PNG/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeExecutable(file, body) {
  writeFileSync(file, body);
  chmodSync(file, 0o755);
}

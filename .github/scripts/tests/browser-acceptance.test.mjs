import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

for (const scenario of [
  'valid',
  'repair',
  'defect',
  'app-not-ready',
  'agent-error',
  'recording-unavailable',
  'evidence-gap',
]) {
  test(`browser acceptance handles ${scenario} with strict verification`, () => {
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
        'check-recording-health.mjs',
        'factory-lib.mjs',
        'stop-stale-app.sh',
        'task-compat.mjs',
        'validate-browser-report.mjs',
      ]) {
        copyFileSync(path.join(scripts, file), path.join(controlScripts, file));
      }
      chmodSync(path.join(controlScripts, 'agent-browser-wrapper.sh'), 0o755);
      chmodSync(path.join(controlScripts, 'stop-stale-app.sh'), 0o755);
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
          "if (process.env.TEST_REPORT_SCENARIO === 'app-not-ready') process.exit(1);",
          "http.createServer((_request, response) => response.end('ok')).listen(Number(process.env.APP_SERVER_PORT), '127.0.0.1');",
          '',
        ].join('\n'),
      );
      writeExecutable(
        path.join(bin, 'agent-browser'),
        '#!/usr/bin/env bash\nset -euo pipefail\nprintf \'%s\\n\' "$*" >> "$TEST_BROWSER_COMMANDS"\nif [[ "$TEST_REPORT_SCENARIO" == recording-unavailable && "$1" == record ]]; then exit 1; fi\nexit 0\n',
      );
      writeExecutable(
        path.join(bin, 'google-chrome'),
        '#!/usr/bin/env bash\nexit 0\n',
      );
      writeFileSync(
        path.join(controlScripts, 'run-agent.mjs'),
        [
          "import { Buffer } from 'node:buffer';",
          "import { execFileSync } from 'node:child_process';",
          "import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';",
          "import path from 'node:path';",
          "const countFile = path.join(process.argv[process.argv.indexOf('--workspace') + 1], 'calls');",
          'const count = existsSync(countFile) ? Number(readFileSync(countFile)) + 1 : 1;',
          'writeFileSync(countFile, String(count));',
          'const scenario = process.env.TEST_REPORT_SCENARIO;',
          "if (process.env.FACTORY_AGENT_ROLE !== 'qa') throw new Error('Missing QA process guard role');",
          'if (count > 1) {',
          "  const prompt = readFileSync(process.argv[process.argv.indexOf('--prompt') + 1], 'utf8');",
          "  if (!prompt.includes('Invalid Agent Browser report:')) throw new Error('Missing validator feedback');",
          "  if (scenario === 'agent-error') process.exit(7);",
          '}',
          "execFileSync('agent-browser', ['skills', 'get', 'core']);",
          "execFileSync('agent-browser', ['open', process.env.FACTORY_BROWSER_URL]);",
          "execFileSync('agent-browser', ['record', 'start', process.env.FACTORY_BROWSER_EVIDENCE_DIR + '/flow-example.webm']);",
          "execFileSync('agent-browser', ['snapshot', '-i']);",
          "execFileSync('agent-browser', ['fill', '@e1', 'value']);",
          "const screenshot = path.join(process.env.FACTORY_BROWSER_EVIDENCE_DIR, 'criterion-1.png');",
          "execFileSync('agent-browser', ['screenshot', screenshot]);",
          'mkdirSync(process.env.FACTORY_BROWSER_EVIDENCE_DIR, { recursive: true });',
          "writeFileSync(screenshot, Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(1100)]));",
          "writeFileSync(process.env.FACTORY_BROWSER_REPORT, JSON.stringify({ passed: true, authenticated: true, summary: 'passed', checks: [{ criterion: 'Page loads', status: 'passed', actions: ['opened and interacted'], evidence: ['page responded'], screenshots: ['criterion-1.png'] }], failures: [] }));",
          "if (scenario === 'evidence-gap') {",
          "  const report = JSON.parse(readFileSync(process.env.FACTORY_BROWSER_REPORT, 'utf8'));",
          "  report.checks[0].criterion = 'Capture editing for the PR';",
          "  if (count > 1) report.checks[0].evidence.push('Verified existing values were prefilled in the edit form.');",
          '  writeFileSync(process.env.FACTORY_BROWSER_REPORT, JSON.stringify(report));',
          "} else if (!['valid', 'recording-unavailable'].includes(scenario) && count <= 2) {",
          "  writeFileSync(process.env.FACTORY_BROWSER_REPORT, JSON.stringify({ passed: true, authenticated: true, summary: 'claims success', checks: [{ name: 'Page loads', status: 'pass', detail: 'page responded' }], failures: [] }));",
          "} else if (scenario === 'defect') {",
          "  const report = JSON.parse(readFileSync(process.env.FACTORY_BROWSER_REPORT, 'utf8'));",
          "  report.passed = false; report.checks[0].status = 'failed'; report.failures = ['Business flow failed'];",
          '  writeFileSync(process.env.FACTORY_BROWSER_REPORT, JSON.stringify(report));',
          '}',
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

      const result = spawnSync(
        browserAcceptance,
        [control, workspace, metadata, config, artifacts, state, '1'],
        {
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            GITHUB_RUN_ID: '123',
            // The fixture starts a real listener on the application port. Keep it away from
            // the default so the test does not depend on what runs on this machine.
            FACTORY_APP_PORT: '13440',
            TEST_REPORT_SCENARIO: scenario,
            TEST_BROWSER_COMMANDS: path.join(root, 'browser-commands'),
          },
          encoding: 'utf8',
          timeout: 20_000,
        },
      );

      assert.equal(
        result.status,
        ['defect', 'app-not-ready'].includes(scenario)
          ? 10
          : scenario === 'agent-error'
            ? 7
            : 0,
        result.stderr,
      );
      if (scenario === 'app-not-ready') {
        // A broken application must reach the repair loop instead of being written off as a
        // failed harness.
        assert.match(
          result.stderr,
          /Application exited before Agent Browser acceptance/,
        );
        return;
      }
      assert.equal(
        readFileSync(
          path.join(state, 'browser-agent-workspace', 'calls'),
          'utf8',
        ),
        ['valid', 'recording-unavailable'].includes(scenario)
          ? '1'
          : ['agent-error', 'evidence-gap'].includes(scenario)
            ? '2'
            : '3',
      );
      if (!['valid', 'recording-unavailable'].includes(scenario)) {
        assert.match(
          readFileSync(path.join(artifacts, 'report-validation-0.log'), 'utf8'),
          scenario === 'evidence-gap'
            ? /existing values were prefilled/
            : /actions must be a non-empty array/,
        );
        assert.match(
          readFileSync(path.join(artifacts, 'report-invalid-0.json'), 'utf8'),
          scenario === 'evidence-gap' ? /Capture editing/ : /detail/,
        );
      }
      const commands = readFileSync(
        path.join(artifacts, 'agent-browser-commands.log'),
        'utf8',
      );
      assert.match(commands, /open/);
      assert.match(commands, /snapshot/);
      assert.match(commands, /fill/);
      assert.match(commands, /screenshot/);
      const lifecycle = readFileSync(
        path.join(root, 'browser-commands'),
        'utf8',
      );
      assert.ok(
        lifecycle.indexOf('record stop') < lifecycle.lastIndexOf('close --all'),
      );
      assert.match(lifecycle, /record start/);
      assert.match(lifecycle, /record stop/);
      assert.equal(
        JSON.parse(readFileSync(path.join(artifacts, 'report.json'), 'utf8'))
          .passed,
        scenario !== 'defect',
      );
      const renderedPrompt = readFileSync(
        path.join(state, 'browser-acceptance.md'),
        'utf8',
      );
      assert.match(renderedPrompt, /完整重新加载应用/u);
      assert.match(renderedPrompt, /管理员的前端权限缓存/u);
      assert.match(
        renderedPrompt,
        /不要再用 Code Agent 的 `read` 工具读取 PNG/u,
      );
      // The recording must cover the whole authenticated session, not a handful of scenes.
      assert.match(renderedPrompt, /acceptance-admin\.webm/u);
      assert.match(renderedPrompt, /acceptance-normal-user\.webm/u);
      if (
        ['valid', 'recording-unavailable', 'evidence-gap'].includes(scenario)
      ) {
        const health = JSON.parse(
          readFileSync(path.join(artifacts, 'media-health.json'), 'utf8'),
        );
        assert.equal(typeof health.checked, 'boolean');
        assert.ok(Array.isArray(health.videos));
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

function writeExecutable(file, body) {
  writeFileSync(file, body);
  chmodSync(file, 0o755);
}

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

const script = path.resolve(import.meta.dirname, '..', 'run-agent.mjs');
const guard = path.resolve(
  import.meta.dirname,
  '..',
  'agents',
  'codebuddy-qa-guard.mjs',
);
const token = 'subscription-token-that-must-not-leak';

test('the CodeBuddy engine fails closed without its own configuration', (t) => {
  const fixture = createFixture(t);
  writeShim(
    fixture,
    'console.log(JSON.stringify({ argv: process.argv.slice(2) }));\n',
  );
  const missingModel = runAdapter(fixture, { CODEBUDDY_MODEL: '' });
  assert.notEqual(missingModel.status, 0);
  assert.match(missingModel.stderr, /CODEBUDDY_MODEL is required/);

  const missingToken = runAdapter(fixture, {
    CODEBUDDY_MODEL: 'test-model',
    CODEBUDDY_AUTH_TOKEN: '',
  });
  assert.notEqual(missingToken.status, 0);
  assert.match(missingToken.stderr, /CODEBUDDY_AUTH_TOKEN is required/);

  const missingAll = runAdapter(fixture, {
    CODEBUDDY_MODEL: 'test-model',
    CODEBUDDY_AUTH_TOKEN: token,
    CODEBUDDY_THINKING: 'extreme',
  });
  assert.notEqual(missingAll.status, 0);
  assert.match(missingAll.stderr, /Unsupported CODEBUDDY_THINKING: extreme/);
});

test('the CodeBuddy engine ignores the Pi configuration namespace', (t) => {
  const fixture = createFixture(t);
  writeShim(
    fixture,
    [
      '#!/usr/bin/env node',
      "let prompt = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (chunk) => { prompt += chunk; });",
      "process.stdin.on('end', () => {",
      '  console.log(JSON.stringify({',
      '    argv: process.argv.slice(2),',
      '    prompt,',
      '    configDir: process.env.CODEBUDDY_CONFIG_DIR,',
      '    piKey: process.env.CODE_AGENT_API_KEY ?? null,',
      '    piEndpoint: process.env.CODE_AGENT_API_ENDPOINT ?? null,',
      '    telemetry: process.env.DISABLE_TELEMETRY,',
      '  }));',
      '});',
      '',
    ].join('\n'),
  );
  const result = runAdapter(fixture, {
    // Pi's own configuration must not satisfy, or leak into, this engine.
    CODE_AGENT_MODEL: 'pi-model',
    CODE_AGENT_API_KEY: 'pi-key-that-must-not-leak',
    CODE_AGENT_API_ENDPOINT: 'https://pi.example/v1',
  });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  const payload = JSON.parse(lines[0]);
  assert.equal(payload.prompt, 'implement the task\n');
  assert.equal(payload.configDir, fixture.agentDir);
  assert.equal(payload.piKey, null);
  assert.equal(payload.piEndpoint, null);
  assert.equal(payload.telemetry, '1');
  assert.deepEqual(payload.argv, [
    '--print',
    '--output-format',
    'stream-json',
    '--model',
    'test-model',
    '--effort',
    'max',
    '-y',
    '--no-session-persistence',
    '--setting-sources',
    'user',
    '--settings',
    path.join(fixture.agentDir, 'settings.json'),
  ]);
  // Only the reviewed user-scope settings may load: the generated application
  // workspace must never be able to inject hooks or permissions.
  assert.equal(payload.argv.includes('project,local'), false);
  const settings = JSON.parse(
    readFileSync(path.join(fixture.agentDir, 'settings.json'), 'utf8'),
  );
  assert.deepEqual(settings, {
    permissions: { defaultMode: 'bypassPermissions' },
    trustAll: true,
    trustedDirectories: [fixture.workspace],
  });
});

for (const [thinking, expected] of [
  [undefined, 'max'],
  ['', 'max'],
  ['low', 'low'],
]) {
  test(`the CodeBuddy engine maps thinking ${JSON.stringify(thinking)} to effort ${expected}`, (t) => {
    const fixture = createFixture(t);
    writeShim(
      fixture,
      'console.log(JSON.stringify({ argv: process.argv.slice(2) }));\n',
    );
    const result = runAdapter(fixture, { CODEBUDDY_THINKING: thinking });
    assert.equal(result.status, 0, result.stderr);
    const args = JSON.parse(result.stdout.trim()).argv;
    assert.equal(args[args.indexOf('--effort') + 1], expected);
  });
}

test('off disables the CodeBuddy effort flag instead of sending an invalid level', (t) => {
  const fixture = createFixture(t);
  writeShim(
    fixture,
    'console.log(JSON.stringify({ argv: process.argv.slice(2) }));\n',
  );
  const result = runAdapter(fixture, { CODEBUDDY_THINKING: 'off' });
  assert.equal(result.status, 0, result.stderr);
  const args = JSON.parse(result.stdout.trim()).argv;
  assert.equal(args.includes('--effort'), false);
});

test('the QA role loads the process guard and other roles do not', (t) => {
  for (const role of ['', 'qa']) {
    const fixture = createFixture(t);
    writeShim(
      fixture,
      'console.log(JSON.stringify({ argv: process.argv.slice(2) }));\n',
    );
    const result = runAdapter(fixture, undefined, role);
    assert.equal(result.status, 0, result.stderr);
    const settings = JSON.parse(
      readFileSync(path.join(fixture.agentDir, 'settings.json'), 'utf8'),
    );
    if (role === 'qa') {
      const hook = settings.hooks.PreToolUse[0];
      assert.equal(hook.matcher, 'Bash');
      assert.equal(hook.hooks[0].type, 'command');
      assert.equal(hook.hooks[0].command, `node '${guard}'`);
    } else {
      assert.equal('hooks' in settings, false);
    }
  }
});

test('the subscription token is redacted from the console and the transcript', (t) => {
  const fixture = createFixture(t);
  writeShim(
    fixture,
    [
      '#!/usr/bin/env node',
      'console.log(JSON.stringify({ type: "system", token: process.env.CODEBUDDY_AUTH_TOKEN }));',
      'console.error(`stderr echo ${process.env.CODEBUDDY_AUTH_TOKEN}`);',
      'console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false }));',
      '',
    ].join('\n'),
  );
  const result = runAdapter(fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, new RegExp(token, 'u'));
  assert.doesNotMatch(result.stderr, new RegExp(token, 'u'));
  assert.match(result.stdout, /\[REDACTED\]/u);
  const transcript = readFileSync(fixture.log, 'utf8');
  assert.doesNotMatch(transcript, new RegExp(token, 'u'));
  assert.match(transcript, /\[REDACTED\]/u);
});

test('streamed deltas and large tool payloads stay out of the Actions log', (t) => {
  const fixture = createFixture(t);
  const payload = 'x'.repeat(50_000);
  writeShim(
    fixture,
    [
      '#!/usr/bin/env node',
      'console.log(JSON.stringify({ type: "stream_event", delta: "hidden-delta" }));',
      `console.log(JSON.stringify({ type: "assistant", message: { role: "assistant", model: "test-model", content: [{ type: "text", text: ${JSON.stringify(payload)} }], usage: { input_tokens: 10, output_tokens: 2 } } }));`,
      'console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, usage: { input_tokens: 10, output_tokens: 2 } }));',
      '',
    ].join('\n'),
  );
  const result = runAdapter(fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /hidden-delta/);
  assert.doesNotMatch(result.stdout, /x{1000}/);
  assert.match(result.stdout, /"chars":50000/);
  assert.match(result.stdout, /"type":"result"/);
  const transcript = readFileSync(fixture.log, 'utf8');
  assert.match(transcript, /hidden-delta/);
  assert.match(transcript, /x{1000}/);
});

test('a CodeBuddy result closes the invocation once the turn is finished', (t) => {
  const fixture = createFixture(t);
  writeShim(
    fixture,
    [
      '#!/usr/bin/env node',
      'console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false }));',
      'setInterval(() => {}, 1_000);',
      '',
    ].join('\n'),
  );
  const startedAt = Date.now();
  const result = runAdapter(fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(Date.now() - startedAt < 7_000);
  assert.match(result.stderr, /closing the completed invocation/);
});

test('a silent CodeBuddy invocation is released to factory verification', (t) => {
  const fixture = createFixture(t);
  writeShim(fixture, '#!/usr/bin/env node\nsetInterval(() => {}, 1_000);\n');
  const result = runAdapter(fixture, { CODE_AGENT_IDLE_TIMEOUT_SECONDS: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stderr,
    /produced no stdout\/stderr activity for 1 seconds/,
  );
});

test('the runner deadline hands a CodeBuddy invocation off with status 75', (t) => {
  const fixture = createFixture(t);
  writeShim(fixture, '#!/usr/bin/env node\nsetInterval(() => {}, 1_000);\n');
  const result = runAdapter(fixture, {
    FACTORY_RUN_DEADLINE_EPOCH_SECONDS: String(
      Math.floor(Date.now() / 1000) + 1,
    ),
  });
  assert.equal(result.status, 75, result.stderr);
  assert.match(result.stderr, /workspace can be handed off/);
});

function createFixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-factory-codebuddy-'));
  const fixture = {
    root,
    bin: path.join(root, 'bin'),
    workspace: path.join(root, 'workspace'),
    prompt: path.join(root, 'task.md'),
    log: path.join(root, 'artifacts', 'agent.jsonl'),
    agentDir: path.join(root, 'agent'),
  };
  mkdirSync(fixture.bin);
  mkdirSync(fixture.workspace);
  writeFileSync(fixture.prompt, 'implement the task\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return fixture;
}

function writeShim(fixture, contents) {
  const source = contents.startsWith('#!')
    ? contents
    : `#!/usr/bin/env node\n${contents}`;
  writeFileSync(path.join(fixture.bin, 'codebuddy'), source, { mode: 0o755 });
}

function runAdapter(fixture, overrides = {}, role = '') {
  return spawnSync(
    process.execPath,
    [
      script,
      '--workspace',
      fixture.workspace,
      '--prompt',
      fixture.prompt,
      '--log',
      fixture.log,
      '--agentDir',
      fixture.agentDir,
    ],
    {
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: `${fixture.bin}:${process.env.PATH}`,
        CODE_AGENT_ENGINE: 'codebuddy',
        CODEBUDDY_AUTH_TOKEN: token,
        CODEBUDDY_MODEL: 'test-model',
        CODE_AGENT_INVOCATION_TIMEOUT_SECONDS: '0',
        CODE_AGENT_IDLE_TIMEOUT_SECONDS: '0',
        FACTORY_RUN_DEADLINE_EPOCH_SECONDS: '',
        FACTORY_AGENT_ROLE: role,
        ...overrides,
      },
    },
  );
}

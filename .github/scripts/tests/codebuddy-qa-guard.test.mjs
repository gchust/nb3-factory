import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

const guard = path.resolve(
  import.meta.dirname,
  '..',
  'agents',
  'codebuddy-qa-guard.mjs',
);

function runGuard(input) {
  return spawnSync(process.execPath, [guard], {
    encoding: 'utf8',
    input,
    timeout: 5_000,
  });
}

for (const command of [
  'pkill -f "agent-browser" 2>/dev/null; sleep 3; agent-browser open http://127.0.0.1:13000/main/',
  '/usr/bin/pkill -f agent-browser',
  'sudo killall chrome',
  'kill -TERM 123',
  "bash -c 'kill 123'",
  'fuser -k 13000/tcp',
]) {
  test(`CodeBuddy QA hook blocks process termination: ${command}`, () => {
    const result = runGuard(
      JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    );
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stdout, /agent-browser close/);
    assert.match(result.stdout, /existing session/);
  });
}

test('the hook accepts the alternate payload casing', () => {
  const result = runGuard(
    JSON.stringify({ toolName: 'bash', input: { command: 'pkill -f chrome' } }),
  );
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /QA must not terminate processes/);
});

test('CodeBuddy QA keeps its own browser control and non-shell tools', () => {
  for (const command of [
    'agent-browser close',
    'agent-browser open http://127.0.0.1:13000/main/',
    'agent-browser record stop',
    'agent-browser snapshot -i',
    'cat "$FACTORY_AGENT_BROWSER_COMMAND_LOG"',
  ]) {
    const result = runGuard(
      JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
  }
  for (const payload of [
    { tool_name: 'Write', tool_input: { content: 'kill' } },
    { tool_name: 'Bash' },
    {},
  ]) {
    const result = runGuard(JSON.stringify(payload));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
  }
});

test('malformed hook input fails open instead of blocking every tool call', () => {
  for (const input of ['', 'not json at all', '{"tool_name":']) {
    const result = runGuard(input);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
  }
});

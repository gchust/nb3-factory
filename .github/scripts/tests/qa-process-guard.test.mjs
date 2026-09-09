import assert from 'node:assert/strict';
import test from 'node:test';

import registerQaProcessGuard from '../agents/qa-process-guard.mjs';

let preflight;
registerQaProcessGuard({
  on(event, handler) {
    assert.equal(event, 'tool_call');
    preflight = handler;
  },
});

for (const command of [
  'pkill -f "agent-browser" 2>/dev/null; sleep 3; agent-browser open http://127.0.0.1:13000/main/',
  '/usr/bin/pkill -f agent-browser',
  'sudo killall chrome',
  'kill -TERM 123',
  "bash -c 'kill 123'",
  'fuser -k 13000/tcp',
]) {
  test(`QA blocks process termination before execution: ${command}`, () => {
    const result = preflight({ toolName: 'bash', input: { command } });
    assert.equal(result.block, true);
    assert.match(result.reason, /agent-browser close/);
    assert.match(result.reason, /existing session/);
  });
}

test('QA can recover its own browser and write an honest report', () => {
  for (const command of [
    'agent-browser close',
    'agent-browser open http://127.0.0.1:13000/main/',
    'agent-browser record stop',
    'agent-browser snapshot -i',
    'cat "$FACTORY_AGENT_BROWSER_COMMAND_LOG"',
  ]) {
    assert.equal(
      preflight({ toolName: 'bash', input: { command } }),
      undefined,
    );
  }
  assert.equal(
    preflight({ toolName: 'write', input: { content: 'kill' } }),
    undefined,
  );
});

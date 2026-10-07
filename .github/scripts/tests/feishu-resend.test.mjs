import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOwners, sendFeishu } from '../daily-findings.mjs';

const config = {
  url: 'https://open.feishu.cn/open-apis/bot/v2/hook/token-in-url',
  secret: '',
  owners: parseOwners(''),
};

async function send(failure) {
  let calls = 0;
  const outcome = await sendFeishu(
    config,
    { msg_type: 'post' },
    {
      fetcher: async () => {
        calls += 1;
        if (calls === 1) throw failure;
        return { ok: true, status: 200, json: async () => ({ code: 0 }) };
      },
      pause: async () => {},
    },
  ).then(
    () => 'sent',
    (error) => error,
  );
  return { calls, outcome };
}

const connectionError = (code) =>
  Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error(code), { code }),
  });

// A digest that may already be in the chat is never sent twice in one run;
// the day stays pending, as after any other failure.
test('a timeout or a dropped connection is not resent', async () => {
  for (const failure of [
    new DOMException(
      'The operation was aborted due to timeout',
      'TimeoutError',
    ),
    connectionError('ECONNRESET'),
    connectionError('UND_ERR_SOCKET'),
  ]) {
    const { calls, outcome } = await send(failure);
    assert.equal(calls, 1, failure.cause?.code ?? failure.name);
    assert.ok(outcome instanceof Error);
    assert.match(outcome.message, /may have been delivered/);
    assert.ok(!outcome.message.includes('token-in-url'));
  }
});

test('a connection that was never made is retried', async () => {
  for (const code of [
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT',
  ]) {
    const { calls, outcome } = await send(connectionError(code));
    assert.equal(calls, 2, code);
    assert.equal(outcome, 'sent');
  }
});

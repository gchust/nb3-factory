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
    assert.equal(outcome.uncertain, true);
    assert.ok(!outcome.message.includes('token-in-url'));
  }
  // DOMException.code is the legacy number 23; the message names the error.
  const { outcome } = await send(
    new DOMException(
      'The operation was aborted due to timeout',
      'TimeoutError',
    ),
  );
  assert.match(outcome.message, /\(TimeoutError\)/);
});

async function respond(status) {
  let calls = 0;
  const outcome = await sendFeishu(
    config,
    { msg_type: 'post' },
    {
      fetcher: async () => {
        calls += 1;
        return calls === 1
          ? { ok: false, status, json: async () => null }
          : { ok: true, status: 200, json: async () => ({ code: 0 }) };
      },
      pause: async () => {},
    },
  ).then(
    () => 'sent',
    (error) => error,
  );
  return { calls, outcome };
}

// A 502 or 504 from a proxy can follow a post Feishu already accepted.
test('only 429 and 503 responses are resent', async () => {
  for (const status of [429, 503]) {
    const { calls, outcome } = await respond(status);
    assert.equal(calls, 2, String(status));
    assert.equal(outcome, 'sent');
  }
  for (const status of [500, 502, 504]) {
    const { calls, outcome } = await respond(status);
    assert.equal(calls, 1, String(status));
    assert.ok(outcome instanceof Error);
    assert.equal(outcome.uncertain, true, String(status));
  }
  // A Feishu error code is a definite answer: not in the chat.
  const rejected = await sendFeishu(
    config,
    { msg_type: 'post' },
    {
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ code: 19021, msg: 'sign match fail' }),
      }),
      pause: async () => {},
    },
  ).catch((error) => error);
  assert.equal(rejected.uncertain, false);
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

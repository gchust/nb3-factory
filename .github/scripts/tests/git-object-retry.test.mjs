import assert from 'node:assert/strict';
import test from 'node:test';

import { GitHubClient } from '../factory-lib.mjs';

const client = () =>
  new GitHubClient({
    token: 'test-only',
    repository: 'owner/factory',
    retryDelays: [0, 0],
  });

function replyWith(t, replies) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(`${options.method} ${new URL(url).pathname}`);
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status,
    });
  });
  t.mock.method(console, 'warn', () => {});
  return calls;
}

test('content-addressed git object POSTs retry a short outage when asked to', async (t) => {
  for (const route of ['/git/blobs', '/git/trees', '/git/commits']) {
    const calls = replyWith(t, [
      { status: 502 },
      new TypeError('fetch failed'),
      { status: 201, body: { sha: 'abc' } },
    ]);
    assert.deepEqual(
      await client().request('POST', route, {
        body: {},
        contentAddressed: true,
      }),
      { sha: 'abc' },
    );
    assert.equal(calls.length, 3, route);
    t.mock.restoreAll();
  }
});

test('a POST without the opt-in is still sent once', async (t) => {
  const calls = replyWith(t, [{ status: 502 }, { status: 201 }]);
  await assert.rejects(
    client().request('POST', '/git/blobs', { body: {} }),
    /failed \(502\)/,
  );
  assert.equal(calls.length, 1);
});

test('the opt-in is refused for any other POST and for ref updates', async (t) => {
  const calls = replyWith(t, []);
  for (const [method, route] of [
    ['POST', '/git/refs'],
    ['POST', '/issues/1/comments'],
    ['PATCH', '/git/refs/heads/gh-pages'],
    ['GET', '/git/blobs'],
  ])
    await assert.rejects(
      client().request(method, route, { contentAddressed: true }),
      /contentAddressed retries apply only to POST/,
      `${method} ${route}`,
    );
  // Refused before anything reached the network.
  assert.equal(calls.length, 0);
});

test('the shared commit helpers opt in for objects and never for the ref', async () => {
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  for (const file of ['report-pages.mjs', 'evaluation-registry.mjs']) {
    const source = readFileSync(
      path.resolve(import.meta.dirname, '..', file),
      'utf8',
    );
    const posts = [
      ...source.matchAll(
        // Up to the end of the statement: bodies nest braces and parentheses.
        /request\(\s*'POST',\s*'(\/git\/[a-z]+)'[^;]*;/g,
      ),
    ];
    assert.ok(posts.length >= 3, file);
    for (const [call, route] of posts) {
      assert.match(route, /^\/git\/(blobs|trees|commits)$/, file);
      assert.match(call, /contentAddressed:\s*true/, `${file} ${route}`);
    }
    assert.doesNotMatch(
      source,
      /'\/git\/refs[^']*'[^)]*contentAddressed/,
      `${file} never retries a ref update`,
    );
  }
});

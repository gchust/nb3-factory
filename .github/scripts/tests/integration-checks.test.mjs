import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { conditionPreflight, runApiKeyCheck } from '../integration-checks.mjs';
const env = { FACTORY_TEST_API_KEY: 'only-isolated-test', FACTORY_TEST_ADMIN_KEY: 'only-isolated-admin' };
const plan = baseUrl => ({ version: 1, kind: 'api-key', applicationSha: 'a'.repeat(40), baseUrl,
  read: { path: '/api/devices', itemsPath: ['data'], idField: 'id', expectedIds: ['one', 'two'] },
  write: { path: '/api/devices', method: 'POST', body: { name: 'denied-test-write' } },
  revoke: { path: '/api/test-key', method: 'DELETE' } });
async function server(t, mode = 'valid') {
  let revoked = false, calls = 0;
  const s = http.createServer((req, res) => {
    calls++;
    const auth = req.headers.authorization;
    if (req.url === '/api/test-key' && req.method === 'DELETE' && auth === `Bearer ${env.FACTORY_TEST_ADMIN_KEY}`) {
      revoked = true; res.writeHead(204).end(); return;
    }
    if (auth !== `Bearer ${env.FACTORY_TEST_API_KEY}` || (revoked && mode !== 'bad-revoke')) { res.writeHead(401).end(); return; }
    if (req.method === 'POST') { res.writeHead(mode === 'bad-write' ? 200 : 403).end(); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(mode === 'login-html' ? '<html>Login</html>' : JSON.stringify({ data: [{ id: 'one' }, { id: 'two' }] }));
  });
  await new Promise(resolve => s.listen(0, '127.0.0.1', resolve)); t.after(() => s.close());
  return { url: `http://127.0.0.1:${s.address().port}`, calls: () => calls };
}
test('real HTTP contract checks valid read, denied write and revoked-key denial', async t => {
  const s = await server(t), r = await runApiKeyCheck(plan(s.url), env);
  assert.equal(r.status, 'passed'); assert.equal(s.calls(), 4);
  assert.deepEqual(r.checks.map(c => c.checkId), ['A01', 'A02', 'A03']);
  assert.doesNotMatch(JSON.stringify(r), /only-isolated|Authorization/);
});
for (const mode of ['bad-write','bad-revoke','login-html']) test(`HTTP runner rejects ${mode}, not a false module pass`, async t => {
  const s = await server(t, mode), r = await runApiKeyCheck(plan(s.url), env);
  assert.equal(r.status, 'failed');
});
test('missing environment blocks before network and external targets are refused', async t => {
  const s = await server(t);
  assert.equal((await runApiKeyCheck(plan(s.url), {})).status, 'blocked'); assert.equal(s.calls(), 0);
  await assert.rejects(runApiKeyCheck(plan('https://production.example.com'), env), /loopback/);
  const p = plan(s.url); p.revoke.path = '//production.example.com'; await assert.rejects(runApiKeyCheck(p, env));
});
test('business model cannot reuse builder key; a configured provider is not called or marked passed', () => {
  assert.equal(conditionPreflight('ai', {}).status, 'blocked');
  const e = { FACTORY_BUSINESS_MODEL: 'test', FACTORY_BUSINESS_MODEL_ENDPOINT: 'https://test.example.com', FACTORY_BUSINESS_API_KEY: 'private', CODE_AGENT_API_KEY: 'private' };
  assert.equal(conditionPreflight('ai', e).status, 'blocked');
  e.FACTORY_BUSINESS_API_KEY = 'separate-test-key'; assert.equal(conditionPreflight('ai', e).status, 'ready');
  assert.doesNotMatch(JSON.stringify(conditionPreflight('ai', e)), /separate-test-key/);
  assert.equal(conditionPreflight('notification', {}).status, 'blocked');
});

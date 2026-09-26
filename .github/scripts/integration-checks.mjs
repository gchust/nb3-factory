// Optional independent HTTP check contract. A plan is supplied by test preparation,
// never generated ad hoc by browser QA. Only isolated loopback applications run here.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hash = v => createHash('sha256').update(v).digest('hex');
export function conditionPreflight(kind, env = process.env) {
  const required = { api: ['FACTORY_TEST_API_KEY', 'FACTORY_TEST_ADMIN_KEY'],
    ai: ['FACTORY_BUSINESS_MODEL', 'FACTORY_BUSINESS_API_KEY', 'FACTORY_BUSINESS_MODEL_ENDPOINT'],
    notification: ['FACTORY_TEST_CHANNEL', 'FACTORY_TEST_RECEIVER_URL'] }[kind];
  if (!required) throw new Error('Unknown independent test kind');
  const missing = required.filter(name => !env[name]?.trim());
  if (kind === 'ai' && env.FACTORY_BUSINESS_API_KEY &&
    ['CODE_AGENT_API_KEY', 'CODEBUDDY_API_KEY', 'CODEBUDDY_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CODEX_API_KEY', 'OPENCODE_API_KEY'].some(name => env[name] && env[name] === env.FACTORY_BUSINESS_API_KEY)) {
    return { version: 1, kind, status: 'blocked', reason: 'Business test credentials must not reuse builder credentials', missing: [] };
  }
  return { version: 1, kind, status: missing.length ? 'blocked' : 'ready', missing,
    reason: missing.length ? 'Test preparation is incomplete; no request was sent' : 'Configuration is present; real service behavior remains unverified' };
}
function endpoint(base, relative) {
  const origin = new URL(base);
  if (origin.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(origin.hostname) || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('Only an explicit isolated loopback origin is accepted');
  }
  if (typeof relative !== 'string' || !relative.startsWith('/') || relative.startsWith('//')) throw new Error('Expected relative API path');
  const url = new URL(relative, origin);
  if (url.origin !== origin.origin) throw new Error('API request left isolated application');
  return url;
}
export function validateApiPlan(plan) {
  if (plan.version !== 1 || plan.kind !== 'api-key' || !/^[a-f0-9]{40}$/u.test(plan.applicationSha ?? '') ||
    !plan.read || !plan.write || !plan.revoke || !Array.isArray(plan.read.expectedIds) || !plan.read.expectedIds.length) throw new Error('Invalid source-bound API plan');
  // Resolve all endpoints and payloads before sending any mutation.
  const urls = Object.fromEntries(['read', 'write', 'revoke'].map(k => [k, endpoint(plan.baseUrl, plan[k].path)]));
  if (!['POST', 'PUT', 'PATCH'].includes(plan.write.method) || !['POST', 'DELETE'].includes(plan.revoke.method)) throw new Error('Unsupported prepared mutation');
  if (!Array.isArray(plan.read.itemsPath) || plan.read.itemsPath.some(k => typeof k !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(k))) throw new Error('Explicit itemsPath required');
  // NocoBase 3 keys use x-api-key; retain legacy Bearer plans explicitly.
  if (plan.authentication !== undefined && !['bearer', 'x-api-key'].includes(plan.authentication)) throw new Error('Unsupported API key authentication');
  return urls;
}
export async function runApiKeyCheck(plan, env = process.env, fetcher = fetch) {
  const urls = validateApiPlan(plan);
  const startedAt = Date.now();
  const measured = value => ({ ...value, timing: { startedAt, endedAt: Date.now(), milliseconds: Date.now() - startedAt }, modelUsage: { invoked: false } });
  const preflight = conditionPreflight('api', env);
  if (preflight.status !== 'ready') return measured({ ...preflight, applicationSha: plan.applicationSha, checks: [] });
  const checks = [];
  async function request(url, method, key, body) {
    const auth = plan.authentication === 'x-api-key' ? { 'x-api-key': key } : { Authorization: 'Bearer ' + key };
    const response = await fetcher(url, { method, headers: { ...auth, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    return { status: response.status, text, digest: hash(text) };
  }
  try {
    const first = await request(urls.read, 'GET', env.FACTORY_TEST_API_KEY);
    let items;
    try { items = plan.read.itemsPath.reduce((v, key) => v?.[key], JSON.parse(first.text)); } catch { /* A login HTML 200 is not API success. */ }
    const expected = plan.read.expectedIds.map(String);
    const received = Array.isArray(items) ? items.map(i => String(i?.[plan.read.idField ?? 'id'])) : [];
    const readPassed = first.status === 200 && expected.every(id => received.includes(id));
    checks.push({ checkId: 'A01', status: readPassed ? 'passed' : 'failed', httpStatus: first.status, responseSha256: first.digest,
      observation: readPassed ? 'Valid test key reads the expected prepared records' : 'Valid-key read did not return the prepared records' });
    if (!readPassed) return measured({ version: 1, kind: 'api-key', applicationSha: plan.applicationSha, status: 'failed', checks });
    const write = await request(urls.write, plan.write.method, env.FACTORY_TEST_API_KEY, plan.write.body);
    checks.push({ checkId: 'A02', status: [401, 403].includes(write.status) ? 'passed' : 'failed', httpStatus: write.status,
      responseSha256: write.digest, observation: 'The same key that could read must be denied the prepared write' });
    const revoke = await request(urls.revoke, plan.revoke.method, env.FACTORY_TEST_ADMIN_KEY, plan.revoke.body);
    if (revoke.status < 200 || revoke.status >= 300) {
      checks.push({ checkId: 'A03', status: 'failed', httpStatus: revoke.status, observation: 'Prepared test-key revocation did not succeed' });
    } else {
      const revoked = await request(urls.read, 'GET', env.FACTORY_TEST_API_KEY);
      checks.push({ checkId: 'A03', status: [401, 403].includes(revoked.status) ? 'passed' : 'failed', httpStatus: revoked.status,
        responseSha256: revoked.digest, observation: 'Revoked test key must no longer read the same records' });
    }
  } catch (error) {
    checks.push({ checkId: 'ENVIRONMENT', status: 'blocked', observation: 'Prepared API exchange failed or timed out; inspect the isolated application logs' });
  }
  return measured({ version: 1, kind: 'api-key', applicationSha: plan.applicationSha,
    status: checks.some(c => c.status === 'failed') ? 'failed' : checks.some(c => c.status === 'blocked') ? 'blocked' : 'passed', checks });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, input, output] = process.argv.slice(2);
  if (!['preflight', 'api'].includes(mode) || !input || !output) throw new Error('Expected preflight <kind> <output> or api <plan> <output>');
  const result = mode === 'preflight' ? conditionPreflight(input) : await runApiKeyCheck(JSON.parse(readFileSync(input, 'utf8')));
  mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  if (!['ready', 'passed'].includes(result.status)) process.exitCode = result.status === 'blocked' ? 20 : 1;
}

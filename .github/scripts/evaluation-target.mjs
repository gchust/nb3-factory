// Delivery target settings. Only repository variables/secrets configure the
// receiver: Issue, Agent or report text can never choose the URL, header name
// or authentication mode. Archives keep only a hash of the target.
import { createHash } from 'node:crypto';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const loopback = host => ['127.0.0.1', 'localhost', '[::1]'].includes(host);
export const AUTH_MODES = ['x-api-key', 'bearer'];
export class DeliveryConfigError extends Error {}


export function targetIdOf(endpoint) {
  const url = new URL(endpoint);
  return sha256(`${url.origin}${url.pathname}`).slice(0, 16);
}

// Loopback HTTP is accepted only through test-only injection, never from task input.
export function deliveryConfig(env, { allowInsecureLoopback = false, requireToken = true } = {}) {
  const problems = [];
  const raw = String(env.EVALUATION_ENDPOINT ?? '').trim();
  let endpoint = null;
  if (!raw) problems.push('Variable EVALUATION_ENDPOINT 未设置');
  else {
    try {
      endpoint = new URL(raw);
      const insecureAllowed = allowInsecureLoopback && endpoint.protocol === 'http:' && loopback(endpoint.hostname);
      if (endpoint.protocol !== 'https:' && !insecureAllowed) problems.push('EVALUATION_ENDPOINT 必须使用 https://');
      if (endpoint.username || endpoint.password) problems.push('EVALUATION_ENDPOINT 不能内嵌用户名或密码');
      if (endpoint.search || endpoint.hash) problems.push('EVALUATION_ENDPOINT 不能带 query 或 fragment；凭据只能放在 Secret EVALUATION_TOKEN');
    } catch { problems.push('EVALUATION_ENDPOINT 不是有效 URL'); }
  }
  const authMode = String(env.EVALUATION_AUTH_MODE || 'x-api-key').trim();
  if (!AUTH_MODES.includes(authMode)) problems.push('Variable EVALUATION_AUTH_MODE 只能是 x-api-key 或 bearer');
  const token = String(env.EVALUATION_TOKEN ?? '');
  if (requireToken && !token) problems.push('Secret EVALUATION_TOKEN 未设置');
  if (token && /[\r\n]/.test(token)) problems.push('Secret EVALUATION_TOKEN 含换行');
  if (problems.length) throw new DeliveryConfigError(problems.join('；'));
  return { endpoint: endpoint.href, authMode, token, targetId: targetIdOf(endpoint.href), origin: endpoint.origin };
}

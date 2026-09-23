// Interpret only a normalized invocation's terminal error, never arbitrary tool
// output. Public summaries use fixed text rather than echoing provider payloads.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { readJson } from './visual-report.mjs';

const categories = {
  auth_configuration: ['模型认证或权限配置错误', false],
  quota_exhausted: ['模型服务额度不足', false],
  provider_unavailable: ['模型服务暂不可用', true],
  rate_limited: ['模型服务限流', true],
  network_error: ['模型请求连接失败或超时', true],
  agent_failure: ['Agent 执行失败，原因需查看日志', false],
};
export function classifyAgentFailure(error) {
  const text = String(error ?? '');
  const status = Number(text.match(/(?:^|\b(?:HTTP(?: status)?|status(?:Code)?|code)\s*[:=]?\s*)([45]\d{2})\b/i)?.[1]);
  let category = 'agent_failure';
  if (/insufficient_quota|quota[_ ]exhausted|billing[_ ]hard[_ ]limit|credit balance.*too low/i.test(text)) category = 'quota_exhausted';
  else if ([500, 502, 503, 504, 529].includes(status) || /auth_unavailable|overloaded_error|service unavailable/i.test(text)) category = 'provider_unavailable';
  else if ([401, 403].includes(status) || /invalid[_ ]api[_ ]key|authentication_error|permission_denied/i.test(text)) category = 'auth_configuration';
  else if (status === 429 || /rate[_ ]limit/i.test(text)) category = 'rate_limited';
  else if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed|connection error|request timed out/i.test(text)) category = 'network_error';
  return { category, retryable: categories[category][1] };
}

export function collectAgentFailure(root) {
  const candidates = [];
  const walk = (relative = '', depth = 0) => {
    let entries;
    try { entries = readdirSync(path.join(root, relative), { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory() && depth < 4 && /^(?:verify-\d+|browser-acceptance|browser-focused)$/.test(entry.name)) walk(name, depth + 1);
      else if (entry.isFile() && /^agent.*\.jsonl\.result\.json$/.test(entry.name)) {
        const result = readJson(root, name);
        if (result?.version === 1 && Number.isFinite(result.endedAt)) candidates.push({ result, source: name });
      }
    }
  };
  walk();
  const latest = candidates.sort((a, b) => b.result.endedAt - a.result.endedAt)[0];
  if (!latest || latest.result.status !== 'failed') return null;
  const failure = classifyAgentFailure(latest.result.error);
  const attempts = latest.result.retryAttempts;
  const phase = ({ implementation: '实现', repair: '修复', qa: '独立验收', 'qa-focused': '定向验收', 'qa-report-repair': '验收报告' })[latest.result.phase] || 'Agent';
  return { ...failure, phase, source: latest.source,
    retryAttempts: Number.isSafeInteger(attempts) && attempts >= 0 ? attempts : null,
    title: categories[failure.category][0],
    detail: `${phase}阶段中断；模型请求重试次数：${Number.isSafeInteger(attempts) && attempts >= 0 ? attempts : '未采集'}。${failure.retryable ? '服务恢复后可尝试从保存的工作继续；不代表业务验证通过。' : '请先检查配置或运行日志；不自动重跑整个搭建。'}`,
  };
}

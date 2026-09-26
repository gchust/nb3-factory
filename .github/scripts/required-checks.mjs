// Trusted, finite evaluator registry. Issue text cannot name shell commands,
// modules, credentials or network targets. New evaluators require a reviewed PR.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  conditionPreflight,
  runApiKeyCheck,
  validateApiPlan,
} from './integration-checks.mjs';

const definitions = {
  'api-key': { kind: 'api', fixture: 'api-key.json' },
  'business-ai': { kind: 'ai', fixture: null },
  'notification-delivery': { kind: 'notification', fixture: null },
};
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../evaluations',
);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sha = /^[a-f0-9]{40}$/;
const sha256 = /^[a-f0-9]{64}$/;
export function validateRequiredChecks(value = []) {
  if (
    !Array.isArray(value) ||
    value.length > 20 ||
    new Set(value).size !== value.length ||
    value.some((id) => !Object.hasOwn(definitions, id))
  )
    throw new Error(
      'Unknown or duplicate required evaluator; add it to the trusted registry first',
    );
  return [...value];
}
export function requiredChecksFor(presetNumber, extra = []) {
  const catalog = JSON.parse(
    readFileSync(path.join(root, 'checks.json'), 'utf8'),
  );
  if (catalog.version !== 1)
    throw new Error('Unsupported required-check catalog');
  return validateRequiredChecks([
    ...new Set([
      ...validateRequiredChecks(catalog.presets[String(presetNumber)] ?? []),
      ...validateRequiredChecks(extra),
    ]),
  ]);
}

function readPlan(directory, name) {
  const file = path.join(directory, name);
  try {
    if (
      lstatSync(directory).isSymbolicLink() ||
      !lstatSync(file).isFile() ||
      lstatSync(file).isSymbolicLink()
    )
      throw new Error('Fixture must be a regular control-plane file');
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
export async function evaluateRequiredChecks({
  metadata,
  mode,
  fixtureDirectory = path.join(root, 'fixtures'),
  env = {},
  patchSha256 = null,
  fetcher = fetch,
}) {
  if (!['preflight', 'run'].includes(mode))
    throw new Error('Unknown required-check mode');
  const ids = validateRequiredChecks(metadata.evaluation?.requiredChecks ?? []);
  const results = [];
  // The preflight job receives presence flags only. No test or builder secret
  // needs to enter that job just to determine whether conditions are missing.
  const conditions =
    mode === 'preflight'
      ? Object.fromEntries(
          Object.entries(env)
            .filter(
              ([name, value]) => name.endsWith('_PRESENT') && value === 'true',
            )
            .map(([name]) => [name.slice(0, -8), 'present']),
        )
      : env;
  for (const id of ids) {
    const definition = definitions[id];
    const condition = conditionPreflight(definition.kind, conditions);
    let result;
    const plan = definition.fixture
      ? readPlan(fixtureDirectory, definition.fixture)
      : null;
    if (condition.status !== 'ready')
      result = {
        status: 'blocked',
        reason: '缺少隔离测试条件：' + condition.missing.join('、'),
        checks: [],
      };
    else if (!definition.fixture)
      result = {
        status: 'not-run',
        reason:
          '只有配置预检，尚无受信任的端到端 evaluator；不能视为验收通过。',
        checks: [],
      };
    else if (!plan)
      result = {
        status: 'blocked',
        reason:
          '缺少控制代码准备的独立 API 测试计划；不从 Agent 产物猜测接口或密钥。',
        checks: [],
      };
    else if (
      !sha.test(plan.applicationSha ?? '') ||
      plan.applicationSha !== metadata.applicationBase?.sha
    )
      result = {
        status: 'blocked',
        reason: '测试计划与冻结应用基线不一致。',
        checks: [],
      };
    else if (
      validateApiPlan(plan) &&
      new URL(plan.baseUrl).origin !==
        'http://127.0.0.1:' + (env.FACTORY_APP_PORT || '13000')
    )
      result = {
        status: 'blocked',
        reason: '测试计划未指向本次隔离应用端口。',
        checks: [],
      };
    else if (mode === 'preflight')
      result = {
        status: 'ready',
        reason: '前置条件齐全，尚未执行业务验收。',
        checks: [],
      };
    else if (!sha256.test(patchSha256 ?? ''))
      result = {
        status: 'blocked',
        reason: '缺少已封存补丁的指纹。',
        checks: [],
      };
    else result = await runApiKeyCheck(plan, env, fetcher);
    results.push({
      id,
      status: result.status,
      reason: result.reason ?? null,
      checks: result.checks ?? [],
    });
  }
  const status = results.some((r) => r.status === 'failed')
    ? 'failed'
    : results.some((r) => r.status === 'blocked')
      ? 'blocked'
      : results.some((r) => r.status === 'not-run')
        ? 'not-run'
        : mode === 'preflight'
          ? 'ready'
          : 'passed';
  return {
    version: 1,
    mode,
    status,
    repository: metadata.repository,
    issue: metadata.issue.number,
    runId: Number(metadata.run?.id) || null,
    attempt: Number(metadata.run?.attempt) || 1,
    applicationSha: metadata.applicationBase?.sha ?? null,
    patchSha256,
    required: ids,
    results,
  };
}

// Only the separate final-verifier artifact can prove completion. A preflight,
// old attempt, different patch or Agent-authored report can never turn it green.
export function requiredCheckCoverage(metadata, finalResult, patchSha256) {
  const required = validateRequiredChecks(
    metadata?.evaluation?.requiredChecks ?? [],
  );
  const matches =
    finalResult?.version === 1 &&
    finalResult.mode === 'run' &&
    finalResult.repository === metadata.repository &&
    finalResult.issue === metadata.issue?.number &&
    finalResult.runId === Number(metadata.run?.id) &&
    finalResult.attempt === Number(metadata.run?.attempt ?? 1) &&
    finalResult.applicationSha === metadata.applicationBase?.sha &&
    sha256.test(patchSha256 ?? '') &&
    finalResult.patchSha256 === patchSha256 &&
    JSON.stringify(finalResult.required) === JSON.stringify(required) &&
    Array.isArray(finalResult.results) &&
    finalResult.results.length === required.length &&
    new Set(finalResult.results.map((r) => r.id)).size === required.length;
  const results = required.map((id) => {
    const result = matches
      ? finalResult.results.find((r) => r.id === id)
      : null;
    const status = ['passed', 'failed', 'blocked', 'not-run'].includes(
      result?.status,
    )
      ? result.status
      : 'not-run';
    return { id, status };
  });
  return {
    status: results.some((r) => r.status === 'failed')
      ? 'failed'
      : results.some((r) => r.status === 'blocked')
        ? 'blocked'
        : results.some((r) => r.status !== 'passed')
          ? 'not-run'
          : 'passed',
    results,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [mode, metadataFile, output, patchFile] = process.argv.slice(2);
  const metadata = JSON.parse(readFileSync(metadataFile, 'utf8'));
  const result = await evaluateRequiredChecks({
    metadata,
    mode,
    env: process.env,
    patchSha256: patchFile ? digest(readFileSync(patchFile)) : null,
  });
  mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  for (const check of result.results)
    console.log(
      check.id +
        ': ' +
        check.status +
        (check.reason ? ' — ' + check.reason : ''),
    );
  if (!['passed', 'ready'].includes(result.status))
    process.exitCode = result.status === 'failed' ? 1 : 20;
}

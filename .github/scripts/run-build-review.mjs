// One bounded, fresh reviewer invocation over a disposable copy of the sealed
// application. It cannot change the patch that verify-final/publish consume.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectReviewProcess, digest, readReviewJson, rubricVersion, safeRelative, validateEvaluation } from './build-review.mjs';
import { resolveAgent } from './agent-registry.mjs';
import { credentialNames, engineEnv } from './agent-adapter.mjs';
import { buildRedactor, runAgentInvocation } from './agent-harness.mjs';
import { createResult, readResult } from './agent-result.mjs';
import { scrubSecrets } from './agent-history.mjs';
import { recordTiming } from './timing.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_BYTES = 48 * 1024 * 1024;
const MAX_FILE = 1024 * 1024;
const blocked = relative => relative.split('/').some(part =>
  ['.git', '.github', 'node_modules', 'dist', 'coverage', '.npmrc', 'config.yml'].includes(part) || /^\.env(?:\.|$)/.test(part));
const sourceExtensions = /\.(?:[cm]?js|jsx|tsx?|json|md|ya?ml|css|sql|html)$/i;
const pngHeader = Buffer.from('89504e470d0a1a0a', 'hex');
const git = (workspace, args) => execFileSync('git', args, { cwd: workspace, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const save = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
};

export function createReviewSnapshot(workspace, artifacts, destination) {
  const files = new Map();
  const omitted = [];
  const packages = [];
  let bytes = 0;
  function capture(from, relative, kind = 'text') {
    if (files.has(relative)) return;
    const stat = lstatSync(from);
    if (!stat.isFile() || stat.isSymbolicLink() || !safeRelative(relative) ||
        stat.size > (kind === 'screenshot' ? 4 * MAX_FILE : MAX_FILE) || bytes + stat.size > MAX_BYTES) {
      omitted.push(relative); return;
    }
    const data = readFileSync(from);
    if (kind === 'screenshot' && !data.subarray(0, 8).equals(pngHeader)) { omitted.push(relative); return; }
    const target = path.join(destination, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, data, { mode: 0o400 });
    files.set(relative, { path: relative, kind, sha256: digest(data),
      ...(kind === 'screenshot' ? {} : { lines: data.toString('utf8').split('\n').length }) });
    bytes += data.length;
  }
  function walk(directory, prefix, packageFiles = false) {
    if (!existsSync(directory)) return;
    if (realpathSync(directory) !== path.resolve(directory)) { omitted.push(prefix); return; }
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) { omitted.push(`${prefix}/${entry.name}`); continue; }
      if (['node_modules', '.git', 'coverage'].includes(entry.name)) continue;
      const from = path.join(directory, entry.name), relative = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(from, relative, packageFiles);
      else if (sourceExtensions.test(entry.name) && (!packageFiles || !entry.name.endsWith('.map'))) capture(from, relative);
    }
  }
  const tracked = git(workspace, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  for (const relative of [...new Set(tracked)].sort()) {
    if (blocked(relative) || !sourceExtensions.test(relative)) continue;
    const from = path.join(workspace, relative);
    if (!existsSync(from)) continue; // Deleted application files are already in the sealed patch.
    // A directory symlink is not a source snapshot.
    if (realpathSync(from) !== path.resolve(from)) { omitted.push(`app/${relative}`); continue; }
    capture(from, `app/${relative}`);
  }
  // skills:sync may produce ignored files; use the installed guidance, not only tracked copies.
  walk(path.join(workspace, '.agents/skills'), 'app/.agents/skills');
  const process = collectReviewProcess(artifacts);
  for (const relative of ['agent.patch', 'retro.json', 'change-summary.json', 'repair-summary.json']) {
    const from = path.join(artifacts, relative);
    if (existsSync(from)) capture(from, `artifacts/${relative}`);
  }
  for (const round of process.rounds) {
    const log = `verify-${round.round}.log`;
    if (existsSync(path.join(artifacts, log))) capture(path.join(artifacts, log), `artifacts/${log}`);
    for (const report of round.reports) {
      capture(path.join(artifacts, report.source), `artifacts/${report.source}`);
      // First and final available full QA screenshots suffice for visual review.
      // Other rounds retain their structured observations without copying all media.
      if (report.scope !== 'full' || ![1, process.finalRound].includes(round.round)) continue;
      const dir = path.join(path.dirname(report.source), 'evidence');
      if (!existsSync(path.join(artifacts, dir))) continue;
      for (const name of readdirSync(path.join(artifacts, dir)).sort().slice(0, 24)) {
        if (/^[A-Za-z0-9][A-Za-z0-9-]*\.png$/.test(name)) capture(path.join(artifacts, dir, name), `artifacts/${dir}/${name}`, 'screenshot');
      }
    }
  }
  const modules = path.join(workspace, 'node_modules/@nocobase');
  if (existsSync(modules)) for (const entry of readdirSync(modules).sort()) {
    try {
      const root = realpathSync(path.join(modules, entry));
      const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
      packages.push({ name: manifest.name, version: manifest.version });
      walk(root, `packages/@nocobase/${entry}`, true);
    } catch { omitted.push(`packages/@nocobase/${entry}`); }
  }
  return { files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)), packages,
    omitted, bytes, process };
}

export function materializeEvidence(review, snapshot, catalog) {
  // Any edit to a reviewed input invalidates the assessment, not the delivery.
  for (const file of catalog) {
    const target = path.join(snapshot, file.path);
    if (!existsSync(target) || lstatSync(target).isSymbolicLink() || digest(readFileSync(target)) !== file.sha256)
      throw new Error(`Reviewer changed captured input: ${file.path}`);
  }
  return {
    ...review,
    evidence: review.evidence.map(evidence => {
      const file = catalog.find(item => item.path === evidence.path);
      const data = readFileSync(path.join(snapshot, file.path));
      return { id: evidence.id, kind: evidence.kind, path: evidence.path, observation: evidence.observation,
        ...(evidence.kind === 'screenshot' ? {} : { lines: evidence.lines }), sha256: file.sha256,
        ...(evidence.kind === 'screenshot' ? {} : {
          excerpt: data.toString('utf8').split('\n').slice(evidence.lines[0] - 1, evidence.lines[1]).join('\n').slice(0, 12000) || '(empty line)',
        }),
      };
    }),
  };
}

export async function runBuildReview(workspace, artifacts, env = process.env) {
  workspace = path.resolve(workspace); artifacts = path.resolve(artifacts);
  const output = path.join(artifacts, 'build-review.json');
  const metadata = readReviewJson(artifacts, 'task-metadata.json');
  const basis = {
    repository: metadata.repository, issue: metadata.issue.number,
    runId: env.GITHUB_RUN_ID ?? '', attempt: Number(env.GITHUB_RUN_ATTEMPT ?? 1),
    controlSha: env.FACTORY_CONTROL_SHA ?? '', rubricVersion,
  };
  // Save a non-scored result before any expensive work, including timeout paths.
  let report = { version: 1, state: 'not-reviewed', reason: '独立评审尚未完成；没有评分。', basis, evaluation: null };
  const redact = buildRedactor(credentialNames.map(name => env[name]).filter(Boolean));
  const persist = () => save(output, JSON.parse(scrubSecrets(redact(JSON.stringify(report)))));
  persist();
  let snapshot;
  const started = Date.now();
  try {
    const mode = env.FACTORY_BUILD_REVIEW ?? 'full';
    if (!['full', 'off'].includes(mode)) throw new Error('FACTORY_BUILD_REVIEW must be full or off');
    if (mode === 'off') { report.reason = '本轮已明确关闭独立评审；只展示流水线事实。'; return report; }
    const requested = Number(env.FACTORY_BUILD_REVIEW_TIMEOUT_SECONDS || 300);
    if (!Number.isInteger(requested) || requested < 30 || requested > 600) throw new Error('Review timeout must be 30–600 seconds');
    const deadline = env.FACTORY_RUN_DEADLINE_EPOCH_SECONDS ? Number(env.FACTORY_RUN_DEADLINE_EPOCH_SECONDS) : null;
    if (deadline !== null && !Number.isSafeInteger(deadline)) throw new Error('Invalid runner deadline');
    const remaining = deadline === null ? requested : Math.min(requested, deadline - Math.ceil(Date.now() / 1000) - 30);
    if (remaining < 30) { report.reason = 'Runner 剩余预算不足，未额外调用评审模型。'; return report; }
    snapshot = mkdtempSync(path.join(os.tmpdir(), 'factory-build-review-'));
    const captured = createReviewSnapshot(workspace, artifacts, snapshot);
    basis.baseSha = git(workspace, ['rev-parse', 'HEAD']).trim();
    basis.patchHash = digest(readFileSync(path.join(artifacts, 'agent.patch')));
    basis.lockfileHash = captured.files.find(file => file.path === 'app/pnpm-lock.yaml')?.sha256 ?? null;
    basis.packages = captured.packages;
    basis.reviewCriteriaHash = digest(metadata.task?.reviewCriteria ?? '');
    const input = {
      rubricVersion, basis, requirements: metadata.task?.requirements ?? '',
      acceptanceCriteria: metadata.task?.acceptanceCriteria ?? '', reviewCriteria: metadata.task?.reviewCriteria ?? '',
      process: captured.process, files: captured.files, omitted: captured.omitted,
    };
    basis.inputHash = digest(JSON.stringify(input));
    save(path.join(snapshot, 'review-input.json'), input);
    // The snapshot root has no application instructions or reused agent session.
    writeFileSync(path.join(snapshot, 'AGENTS.md'), 'Read-only assessment. Follow review-prompt.md. Do not build, repair, install, publish, or run application code. Write only assessment.json.\n');
    const prompt = readFileSync(path.join(HERE, '../prompts/build-review.md'), 'utf8').replaceAll('{{INPUT_HASH}}', basis.inputHash);
    const promptPath = path.join(snapshot, 'review-prompt.md');
    writeFileSync(promptPath, prompt);
    const adapter = resolveAgent(env);
    const agentEnv = engineEnv({ ...env, FACTORY_AGENT_ROLE: 'review' }, adapter.credentials);
    for (const name of ['GITHUB_TOKEN', 'GH_TOKEN', 'FACTORY_ADMIN_PASSWORD', 'FACTORY_TEST_PASSWORD']) delete agentEnv[name];
    const log = path.join(artifacts, 'agent-review.jsonl');
    const invocation = adapter.createInvocation({ workspace: snapshot, prompt: promptPath, log,
      agentDir: path.join(snapshot, '.review-agent'), env: agentEnv });
    let actualVersion = null, configuredVersion = adapter.version;
    if (env.FACTORY_AGENT_INSTALL_RECORD) {
      const installed = JSON.parse(readFileSync(env.FACTORY_AGENT_INSTALL_RECORD, 'utf8'));
      if (installed.engine !== adapter.id) throw new Error('Reviewer engine differs from installed engine');
      actualVersion = installed.actualVersion; configuredVersion = installed.configuredVersion;
    }
    report.reviewer = { engine: adapter.id, model: invocation.model, version: actualVersion };
    await runAgentInvocation({ ...invocation, log, parseEvent: adapter.parseEvent,
      secrets: [...(invocation.secrets ?? []), ...credentialNames.map(name => env[name])],
      result: createResult({ engine: adapter.id, model: invocation.model, configuredVersion, actualVersion,
        completion: adapter.completion ?? 'event', phase: 'review', role: 'review' }),
      invocationTimeoutSeconds: remaining, idleTimeoutSeconds: Math.min(90, remaining),
    });
    const result = readResult(log);
    if (result?.status !== 'completed' || (result.completion !== 'exit' && !result.terminalEvent))
      throw new Error('Reviewer invocation did not complete');
    const raw = readReviewJson(snapshot, 'assessment.json');
    validateEvaluation(raw, basis.inputHash, captured.files);
    const knownCriteria = new Set(captured.process.rounds.flatMap(round => round.reports.flatMap(item => item.checks.map(check => check.id))).filter(Boolean));
    for (const module of raw.modules) for (const id of module.criteria) {
      if (!knownCriteria.has(id)) throw new Error(`Module references an unrecorded criterion: ${id}`);
    }
    report.evaluation = materializeEvidence(raw, snapshot, captured.files);
    if (captured.omitted.length && report.evaluation.limitations.length < 30) report.evaluation.limitations.push(`快照未包含 ${captured.omitted.length} 个超出预算、非普通文件或不可读取的文件；未据此确认其实现。`);
    report.state = 'completed'; report.reason = '独立 Agent 评审完成；评分是基于本次证据的意见，不替代业务 QA 或人工评审。';
  } catch (error) {
    report.state = 'failed'; report.evaluation = null;
    report.reason = `独立评审未完成或证据校验失败：${error.message}。业务验收结果保持不变。`;
  } finally {
    persist();
    recordTiming('agent:review', started, report.state === 'failed' ? 1 : 0);
    if (snapshot) rmSync(snapshot, { recursive: true, force: true });
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [workspace, artifacts] = process.argv.slice(2);
  if (!workspace || !artifacts) throw new Error('Usage: run-build-review.mjs <workspace> <artifact-dir>');
  await runBuildReview(workspace, artifacts);
}

// One bounded, fresh reviewer invocation over a disposable copy of the sealed
// application. It cannot change the patch that verify-final/publish consume.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectReviewProcess, digest, readReviewJson, rubricVersion, safeRelative, validateEvaluation, reviewArtifactHash } from './build-review.mjs';
import { resolveAgent } from './agent-registry.mjs';
import { credentialNames, engineEnv } from './agent-adapter.mjs';
import { buildRedactor, runAgentInvocation } from './agent-harness.mjs';
import { createResult, readResult } from './agent-result.mjs';
import { scrubSecrets } from './agent-history.mjs';
import { recordTiming } from './timing.mjs';
import { beginInvocation } from './agent-invocation-record.mjs';
import { resolveBuildReviewMode } from './factory-lib.mjs';

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

export function finalizeAssessment(snapshot, captured, basis, finished) {
  const raw = readReviewJson(snapshot, 'assessment.json');
  validateEvaluation(raw, basis.inputHash, captured.files, basis.rubricVersion);
  const partial = !finished || raw.progress?.complete === false;
  if (partial && (!raw.modules.length || !raw.evidence.length)) throw new Error('No assessed module checkpoint');
  const knownCriteria = new Set(captured.process.rounds.flatMap(round => round.reports.flatMap(item => item.checks.map(check => check.id))).filter(Boolean));
  for (const module of raw.modules) for (const id of module.criteria) {
    if (!knownCriteria.has(id)) throw new Error(`Module references an unrecorded criterion: ${id}`);
  }
  if (raw.version === 2) for (const module of raw.modules) for (const target of module.targets) {
    if (target.kind !== 'guidance' && !captured.packages.some(pkg => pkg.name === target.name) &&
        Object.values(module.scores).some(score => score.score !== null)) throw new Error(`Framework target was not installed: ${target.name}`);
  }
  const evaluation = materializeEvidence(raw, snapshot, captured.files);
  if (captured.omitted.length && evaluation.limitations.length < 30) evaluation.limitations.push(`快照未包含 ${captured.omitted.length} 个超出预算、非普通文件或不可读取的文件；未据此确认其实现。`);
  return { evaluation, partial };
}

export async function runBuildReview(workspace, artifacts, env = process.env, options = {}) {
  workspace = path.resolve(workspace); artifacts = path.resolve(artifacts);
  const output = path.join(artifacts, 'build-review.json');
  const metadata = readReviewJson(artifacts, 'task-metadata.json');
  const original = existsSync(output) ? readReviewJson(artifacts, 'build-review.json') : null;
  const basis = {
    repository: metadata.repository, issue: metadata.issue.number,
    runId: options.source?.runId ?? env.GITHUB_RUN_ID ?? '', attempt: Number(options.source?.attempt ?? env.GITHUB_RUN_ATTEMPT ?? 1),
    controlSha: options.source?.controlSha ?? env.FACTORY_CONTROL_SHA ?? '', rubricVersion,
  };
  // Save a non-scored result before any expensive work, including timeout paths.
  let report = { version: 1, state: 'not-reviewed', reason: '独立评审尚未完成；没有评分。', basis, evaluation: null };
  const redact = buildRedactor(credentialNames.map(name => env[name]).filter(Boolean));
  const persist = () => save(output, JSON.parse(scrubSecrets(redact(JSON.stringify(report)))));
  persist();
  let snapshot, capture, invocationError;
  const started = Date.now();
  try {
    const mode = resolveBuildReviewMode(metadata.task, env, Boolean(options.source));
    report.execution = { buildReviewMode: mode, source: options.source ? 'reassessment' : metadata.task?.buildReviewMode ? 'task' : 'repository' };
    if (mode === 'off') { report.reason = '本轮已明确关闭独立评审；只展示流水线事实。'; return report; }
    const requested = Number(env.FACTORY_BUILD_REVIEW_TIMEOUT_SECONDS || 900);
    if (!Number.isInteger(requested) || requested < 30 || requested > 1800) throw new Error('Review timeout must be 30–1800 seconds');
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
    basis.artifactHash = reviewArtifactHash(artifacts);
    if (options.source) {
      if (basis.baseSha !== options.source.baseSha || basis.patchHash !== options.source.patchHash)
        throw new Error('Replay does not reconstruct the sealed application');
      if (original?.basis?.lockfileHash && original.basis.lockfileHash !== basis.lockfileHash)
        throw new Error('Replay lockfile differs from original assessment');
      if (original?.basis?.packages && JSON.stringify(original.basis.packages) !== JSON.stringify(basis.packages))
        throw new Error('Replay installed packages differ from original assessment');
    }
    const catalogHash = digest(JSON.stringify(captured.files));
    save(path.join(snapshot, 'review-files.json'), captured.files);
    save(path.join(artifacts, 'build-review-files.json'), captured.files);
    const changedFiles = [...new Set(readFileSync(path.join(artifacts, 'agent.patch'), 'utf8')
      .split('\n').filter(line => line.startsWith('+++ b/')).map(line => `app/${line.slice(6)}`))]
      .filter(file => captured.files.some(item => item.path === file));
    const input = {
      rubricVersion, basis, requirements: metadata.task?.requirements ?? '',
      acceptanceCriteria: metadata.task?.acceptanceCriteria ?? '', reviewCriteria: metadata.task?.reviewCriteria ?? '',
      process: captured.process, changedFiles: changedFiles.slice(0, 80),
      catalog: { path: 'review-files.json', sha256: catalogHash, count: captured.files.length },
      omittedCount: captured.omitted.length, budgetSeconds: remaining,
    };
    basis.inputHash = digest(JSON.stringify(input));
    save(path.join(snapshot, 'review-input.json'), input);
    save(path.join(snapshot, 'assessment.json'), { version: rubricVersion, inputHash: basis.inputHash,
      summary: '尚未完成任何模块的证据评审。', modules: [], findings: [], evidence: [],
      ui: { status: 'not-reviewed', score: null, reason: '尚未执行跨页面图像审阅。', evidence: [] },
      limitations: ['评审进行中，未覆盖的模块不推断通过。'], progress: { complete: false, pendingModules: [] } });
    // Persist the compact input/provenance, not the entire package catalog in the prompt.
    save(path.join(artifacts, 'build-review-input.json'), input);
    // The snapshot root has no application instructions or reused agent session.
    writeFileSync(path.join(snapshot, 'AGENTS.md'), 'Read-only assessment. Follow review-prompt.md. Do not build, repair, install, publish, or run application code. Update assessment.json atomically via assessment.tmp.json.\n');
    const prompt = readFileSync(path.join(HERE, '../prompts/build-review.md'), 'utf8').replaceAll('{{INPUT_HASH}}', basis.inputHash).replaceAll('{{BUDGET_SECONDS}}', String(remaining));
    const promptPath = path.join(snapshot, 'review-prompt.md');
    writeFileSync(promptPath, prompt);
    const adapter = resolveAgent(env);
    const agentEnv = engineEnv({ ...env, CODE_AGENT_THINKING: env.FACTORY_REVIEW_THINKING || 'medium', FACTORY_AGENT_ROLE: 'review' }, adapter.credentials);
    for (const name of ['GITHUB_TOKEN', 'GH_TOKEN', 'FACTORY_ADMIN_PASSWORD', 'FACTORY_TEST_PASSWORD']) delete agentEnv[name];
    const log = path.join(artifacts, 'agent-review.jsonl');
    capture = beginInvocation({ log, prompt: promptPath, workspace: snapshot, engine: adapter.id,
      phase: 'review', secrets: credentialNames.map(name => env[name]), env,
      contextFiles: ['review-input.json', 'review-files.json'] });
    const invocation = adapter.createInvocation({ workspace: snapshot, prompt: promptPath, log,
      agentDir: path.join(snapshot, '.review-agent'), env: agentEnv });
    let actualVersion = null, configuredVersion = adapter.version;
    if (env.FACTORY_AGENT_INSTALL_RECORD) {
      const installed = JSON.parse(readFileSync(env.FACTORY_AGENT_INSTALL_RECORD, 'utf8'));
      if (installed.engine !== adapter.id) throw new Error('Reviewer engine differs from installed engine');
      actualVersion = installed.actualVersion; configuredVersion = installed.configuredVersion;
    }
    report.reviewer = { engine: adapter.id, model: invocation.model, version: actualVersion,
      runId: env.GITHUB_RUN_ID ?? '', attempt: Number(env.GITHUB_RUN_ATTEMPT ?? 1),
      controlSha: env.FACTORY_CONTROL_SHA ?? '', replay: Boolean(options.source) };
    capture.start({ ...invocation, actualVersion, configuredVersion });
    try { await runAgentInvocation({ ...invocation, log, parseEvent: adapter.parseEvent,
      secrets: [...(invocation.secrets ?? []), ...credentialNames.map(name => env[name])],
      result: createResult({ engine: adapter.id, model: invocation.model, configuredVersion, actualVersion,
        completion: adapter.completion ?? 'event', phase: 'review', role: 'review' }),
      invocationTimeoutSeconds: remaining, idleTimeoutSeconds: Math.min(180, remaining),
    }); } catch (error) { invocationError = error; }
    const result = readResult(log);
    const finished = result?.status === 'completed' && (result.completion === 'exit' || result.terminalEvent);
    // Only bounded timeout may salvage a valid checkpoint; auth/protocol/crash
    // errors do not turn arbitrary leftover JSON into a successful assessment.
    if (!finished && result?.status !== 'timed_out') throw invocationError ?? new Error('Reviewer invocation did not complete');
    const assessed = finalizeAssessment(snapshot, captured, basis, finished);
    report.evaluation = assessed.evaluation;
    const partial = assessed.partial;
    report.state = partial ? 'partial' : 'completed';
    report.reason = partial ? '评审预算已结束或尚有未评模块；仅展示已保存并通过证据校验的模块，不代表完整评审。' : '独立 Agent 评审完成；评分是基于本次证据的意见，不替代业务 QA 或人工评审。';
    if (partial) {
      if (report.evaluation.limitations.length === 30) report.evaluation.limitations.pop();
      report.evaluation.limitations.push(report.reason);
    }
  } catch (error) {
    invocationError ??= error;
    report.state = 'failed'; report.evaluation = null;
    report.reason = `独立评审未完成或证据校验失败：${error.message}。业务验收结果保持不变。`;
  } finally {
    capture?.finish(invocationError);
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

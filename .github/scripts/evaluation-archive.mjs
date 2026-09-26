// Trusted CLI around evaluation export and revision registration.
//   export  (report job, read-only)  facts → draft.json + attachment copies
//   prepare (evaluation job)         reuse or propose a revision, pack the bundle
//   commit  (evaluation job)         register it under CAS, optionally queue delivery
import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBundle, verifyBundle } from './evaluation-bundle.mjs';
import { deliveryConfig, DeliveryConfigError } from './evaluation-target.mjs';
import { keyDigest } from './evaluation-identity.mjs';
import { buildEvaluation, carryReviewHistory, detachMissingAttachments, finalizeEvaluation, fingerprintEvaluation, documentKeyOf, refreshCurrentView } from './evaluation-report.mjs';
import { commitRevision, planRevision, readHistory, registeredDocuments } from './evaluation-registry.mjs';
import { parseBoolean } from './factory-lib.mjs';

const MAX_HTML = 32 * 1024 * 1024;
const RETAIN_AGAIN_DAYS = 30;
const output = (name, value) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const save = (file, value) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const regular = file => { try { const stat = lstatSync(file); return stat.isFile() && !stat.isSymbolicLink() ? stat : null; } catch { return null; } };
export const artifactName = (type, key, revision) => `factory-evaluation-${type === 'evaluation-batch' ? 'batch' : 'run'}-${keyDigest(key).slice(0, 20)}-r${revision}`;

// Export only copies files the exporter selected from the trusted artifact tree.
export function exportDraft({ report, artifacts, task, final, html, output: out, exporter }) {
  // A run that stopped before its Agent artifact still exports its receipts and metadata.
  const root = artifacts && existsSync(artifacts) ? artifacts : mkdtempSync(path.join(os.tmpdir(), 'evaluation-empty-'));
  const { draft, attachments } = buildEvaluation({ report, root, finalRoot: final && existsSync(final) ? final : null, taskRoot: task && existsSync(task) ? task : null, exporter });
  mkdirSync(path.join(out, 'files'), { recursive: true });
  const files = [];
  for (const item of attachments) {
    const target = path.join(out, 'files', item.path);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(item.file, target);
    const { file, ...meta } = item;
    files.push(meta);
  }
  const page = html && regular(html);
  if (page && page.size <= MAX_HTML) {
    copyFileSync(html, path.join(out, 'files', 'report.html'));
    files.push({ path: 'report.html', role: 'report-html', mediaType: 'text/html', size: page.size, logical: false });
  } else if (html) draft.limitations.push({ code: 'report-html-omitted', detail: '统一 HTML 报告缺失或超出结果包预算，未随包附带；gh-pages 归档不受影响。' });
  save(path.join(out, 'draft.json'), draft);
  save(path.join(out, 'files.json'), files);
  return { draft, files };
}

function loadFiles(input) {
  const files = json(path.join(input, 'files.json'));
  if (!Array.isArray(files) || files.length > 2046) throw new Error('Invalid evaluation attachment list');
  return files.map(item => {
    if (!/^(?:report\.html|evidence\/[A-Za-z0-9][A-Za-z0-9._/-]{0,250}\.png)$/.test(item.path ?? '') || item.path.split('/').includes('..'))
      throw new Error('Invalid evaluation attachment path');
    const file = path.join(input, 'files', item.path);
    if (!regular(file)) throw new Error(`Evaluation attachment is not a regular file: ${item.path}`);
    return { ...item, data: readFileSync(file) };
  });
}

// A refreshed view's bundle: the screenshots it references that this export of the same
// build holds byte for byte. Any other one stays referenced by path and digest only.
function viewFiles(view, files) {
  const local = new Map(files.filter(item => item.role === 'evidence').map(item => [item.path, item]));
  detachMissingAttachments(view, (attachment, sha256) =>
    local.has(attachment) && createHash('sha256').update(local.get(attachment).data).digest('hex') === sha256);
  const needed = new Map();
  for (const item of view.evidence.filter(entry => entry.attachment)) {
    const entry = needed.get(item.attachment) ?? { ...local.get(item.attachment), evidenceIds: [] };
    entry.evidenceIds = [...new Set([...entry.evidenceIds, item.id])];
    needed.set(item.attachment, entry);
  }
  return [...needed.values()];
}

// Logical attachments are the evidence; the HTML rendering is not part of the fingerprint.
export async function prepareRevision(client, { input, output: out, now = new Date() }) {
  let draft = json(path.join(input, 'draft.json'));
  let files = loadFiles(input);
  const key = documentKeyOf(draft);
  // The same snapshot decides the carried review history and the revision number.
  const history = await readHistory(client, { type: draft.type, key });
  if (draft.type === 'evaluation-report') {
    const registered = await registeredDocuments(client, history, key);
    const exported = structuredClone(draft);
    carryReviewHistory(draft, registered);
    // A late older review is registered inside the refreshed current view, which keeps the
    // newer review selected; its usage never depends on whether screenshots can be re-packed.
    // The view merges this export's own records, as exported, with the registered history.
    const view = refreshCurrentView(exported, registered, history.index?.current);
    if (view) [draft, files] = [view, viewFiles(view, files)];
  }
  const evidence = files.filter(item => item.role === 'evidence');
  const fingerprint = fingerprintEvaluation(draft, evidence);
  const plan = await planRevision(client, { type: draft.type, key, fingerprint, history });
  let evaluationBytes, document, bundle, reproduced = true;
  if (plan.reused) {
    evaluationBytes = plan.evaluationBytes;
    document = JSON.parse(evaluationBytes.toString('utf8'));
    const stored = JSON.parse(plan.manifestBytes.toString('utf8'));
    const local = new Map(files.map(item => [item.path, item]));
    // Re-pack only when every original file is available byte-for-byte; otherwise keep the original bundle.
    const originals = stored.files.filter(item => item.path !== 'evaluation.json').map(item => local.get(item.path));
    // Re-upload an identical copy only to extend retention, not on every replay.
    const newest = Math.max(0, ...plan.entry.bundle.locations.map(item => Date.parse(item.at ?? '') || 0));
    reproduced = originals.every(Boolean) && now.getTime() - newest > RETAIN_AGAIN_DAYS * 86400_000;
    if (reproduced) {
      bundle = createBundle({ evaluationBytes, files: originals.map(item => ({ ...item, evidenceIds: item.evidenceIds })) });
      reproduced = bundle.sha256 === plan.entry.bundle.sha256;
    }
  } else {
    ({ document, bytes: evaluationBytes } = finalizeEvaluation(draft, { revision: plan.revision, createdAt: now.toISOString() }));
    bundle = createBundle({ evaluationBytes, files });
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'evaluation.json'), evaluationBytes);
  if (reproduced) {
    verifyBundle(bundle.zip, { sha256: plan.reused ? plan.entry.bundle.sha256 : bundle.sha256 });
    writeFileSync(path.join(out, 'evaluation-bundle.zip'), bundle.zip);
    writeFileSync(path.join(out, 'manifest.json'), bundle.manifestBytes);
  } else writeFileSync(path.join(out, 'manifest.json'), plan.manifestBytes);
  const registration = { version: 1, type: document.type, key, revision: document.revision, fingerprint, reused: plan.reused,
    upload: reproduced, bundleSha256: plan.reused ? plan.entry.bundle.sha256 : bundle.sha256,
    bundleSize: plan.reused ? plan.entry.bundle.size : bundle.zip.length, artifactName: artifactName(document.type, key, document.revision) };
  save(path.join(out, 'registration.json'), registration);
  return registration;
}

export async function commitPrepared(client, { input, env, runId, attempt, artifactId }) {
  const registration = json(path.join(input, 'registration.json'));
  const evaluationBytes = readFileSync(path.join(input, 'evaluation.json'));
  const manifestBytes = readFileSync(path.join(input, 'manifest.json'));
  const document = JSON.parse(evaluationBytes.toString('utf8'));
  let outbox = null, warning = null;
  if (parseBoolean(env.FACTORY_EVALUATION_DELIVERY)) {
    try { outbox = { targetId: deliveryConfig(env, { requireToken: false }).targetId }; }
    catch (error) {
      if (!(error instanceof DeliveryConfigError)) throw error;
      warning = `投递已启用但目标配置无效，未登记待投递记录：${error.message}`;
    }
  }
  const location = registration.upload && Number(runId) > 0
    ? { runId: Number(runId), attempt: Number(attempt) || 1, artifactName: registration.artifactName, artifactId: Number(artifactId) || null, at: new Date().toISOString() }
    : null;
  const result = await commitRevision(client, { document, evaluationBytes, manifestBytes, fingerprint: registration.fingerprint,
    bundle: { sha256: registration.bundleSha256, size: registration.bundleSize }, location, outbox });
  return { registration, result, warning, queued: Boolean(outbox) };
}

async function main() {
  const [mode, ...argv] = process.argv.slice(2);
  if (argv.length % 2) throw new Error('Expected --name value arguments');
  const args = Object.fromEntries(Array.from({ length: argv.length / 2 }, (_, i) => [argv[i * 2].replace(/^--/, ''), argv[i * 2 + 1]]));
  const { GitHubClient } = await import('./factory-lib.mjs');
  const client = () => new GitHubClient({ token: process.env.GITHUB_TOKEN, repository: process.env.GITHUB_REPOSITORY, apiUrl: process.env.GITHUB_API_URL });
  if (mode === 'export') {
    const { draft, files } = exportDraft({ report: json(args.report), artifacts: args.artifacts, task: args.task, final: args.final, html: args.html, output: args.output,
      exporter: { controlSha: process.env.FACTORY_EXPORTER_SHA, runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT } });
    output('ready', 'true');
    console.log(`Exported ${documentKeyOf(draft)} (${draft.outcome.execution}/${draft.outcome.acceptance}) with ${files.length} file(s); no model was called.`);
  } else if (mode === 'prepare') {
    const registration = await prepareRevision(client(), { input: args.input, output: args.output });
    output('upload', registration.upload); output('artifact_name', registration.artifactName);
    console.log(`${registration.reused ? 'Reusing' : 'Prepared'} ${registration.type} revision ${registration.revision} (${registration.bundleSha256.slice(0, 12)}).`);
  } else if (mode === 'commit') {
    const { registration, result, warning, queued } = await commitPrepared(client(), { input: args.input, env: process.env,
      runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, artifactId: args['artifact-id'] });
    if (warning) console.log(`::warning::${warning}`);
    output('type', registration.type); output('key', registration.key); output('revision', registration.revision); output('queued', queued);
    const line = `评测结果 ${registration.type} r${registration.revision}（${registration.reused ? '复用已有修订' : '新修订'}，当前视图 r${result.current}）已登记；投递${queued ? '已排队' : '未启用'}。`;
    console.log(line);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${line}\n`);
  } else throw new Error('Usage: evaluation-archive.mjs <export|prepare|commit> ...');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });

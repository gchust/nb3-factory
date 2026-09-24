// Trusted evaluation-batch receipts. The bootstrap uses this before any task
// code is checked out, so it imports only Node built-ins. A batch sample runs
// the batch's frozen control plane only when the sample Issue, its bot receipt,
// the checksummed batch manifest and the latest batch state all agree.
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SAMPLE_LABEL = 'factory:evaluation-sample';
export const BATCH_LABEL = 'factory:evaluation-batch';
export const MANUAL_LABEL = 'factory:manual';
const sha = /^[a-f0-9]{40}$/;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const segment = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const positive = value => Number.isSafeInteger(value) && value > 0;
export const isBot = user => user?.login === 'github-actions[bot]' && user?.type === 'Bot';
const labels = issue => (issue.labels ?? []).map(label => label.name ?? label);
export const isSampleIssue = issue => labels(issue).includes(SAMPLE_LABEL);

export const markers = {
  batch: key => `<!-- factory-evaluation-batch:${key} -->`,
  sample: key => `<!-- factory-evaluation-sample:${key} -->`,
  receipt: '<!-- factory-evaluation-sample-v1:',
  dispatched: key => `<!-- factory-evaluation-sample-dispatched:${key} -->`,
  claim: (key, runId) => `<!-- factory-evaluation-sample-claim:${key}:${runId} -->`,
  terminal: '<!-- factory-evaluation-sample-terminal-v1:',
};
export const TERMINAL_DECISIONS = ['cancelled', 'budget-exhausted'];
const manifestPattern = /<!-- factory-evaluation-batch-manifest-v1:([a-f0-9]{64}):(\d+):(\d+)\n([A-Za-z0-9+/=]+)\n-->$/;
const statePattern = /<!-- factory-evaluation-batch-state-v1:([A-Za-z0-9][A-Za-z0-9._-]{0,79}):([1-9]\d*):([a-f0-9]{64})\n([A-Za-z0-9+/=]+)\n-->$/;

export function chunkText(text, size = 48000) {
  const parts = [];
  for (let offset = 0; offset < text.length; offset += size) parts.push(text.slice(offset, offset + size));
  return parts.length ? parts : [''];
}
export const manifestComment = (hash, index, count, part) =>
  `评测批次冻结清单 ${index + 1}/${count}（由工厂读取，请勿删除或编辑）。\n\n<!-- factory-evaluation-batch-manifest-v1:${hash}:${index}:${count}\n${part}\n-->`;
export const stateComment = (state, hash, summary) =>
  `${summary}\n\n<!-- factory-evaluation-batch-state-v1:${state.batchKey}:${state.sequence}:${hash}\n${Buffer.from(JSON.stringify(state)).toString('base64')}\n-->`;

// Only a complete, checksummed, bot-authored manifest is accepted.
export function readManifest(comments) {
  const groups = new Map();
  for (const comment of comments.filter(c => isBot(c.user)).sort((a, b) => a.id - b.id)) {
    const match = manifestPattern.exec(comment.body ?? '');
    if (!match) continue;
    const [, hash, index, count, part] = match;
    const group = groups.get(hash) ?? { count: Number(count), parts: new Map() };
    if (group.count !== Number(count)) throw new Error('Batch manifest chunk count mismatch');
    if (!group.parts.has(Number(index))) group.parts.set(Number(index), part);
    groups.set(hash, group);
  }
  const complete = [...groups].filter(([, group]) => group.parts.size === group.count);
  if (complete.length !== 1) return null;
  const [hash, group] = complete[0];
  const json = Buffer.from(Array.from({ length: group.count }, (_, i) => group.parts.get(i)).join(''), 'base64').toString('utf8');
  if (sha256(json) !== hash) throw new Error('Batch manifest checksum mismatch');
  const manifest = JSON.parse(json);
  if (manifest.version !== 1 || manifest.type !== 'evaluation-batch-manifest' || !segment.test(manifest.batchKey ?? '') ||
      !sha.test(manifest.controlSha ?? '') || !sha.test(manifest.applicationBaseSha ?? '') || !Array.isArray(manifest.samples))
    throw new Error('Invalid batch manifest');
  return { manifest, hash };
}

export function readState(comments, batchKey, manifestHash) {
  let latest = null;
  for (const comment of comments.filter(c => isBot(c.user))) {
    const match = statePattern.exec(comment.body ?? '');
    if (!match || match[1] !== batchKey || match[3] !== manifestHash) continue;
    const state = JSON.parse(Buffer.from(match[4], 'base64').toString('utf8'));
    if (state.version !== 1 || state.batchKey !== batchKey || state.sequence !== Number(match[2]) || state.manifestHash !== manifestHash ||
        typeof state.samples !== 'object') throw new Error('Invalid batch state snapshot');
    if (!latest || state.sequence > latest.state.sequence) latest = { state, commentId: comment.id };
    else if (state.sequence === latest.state.sequence) throw new Error('Duplicate batch state sequence');
  }
  return latest;
}

export function readSampleReceipt(comments, issueNumber) {
  const found = comments.filter(c => isBot(c.user) && (c.body ?? '').startsWith(markers.receipt));
  if (found.length !== 1) return null;
  const first = found[0].body.split(/\r?\n/, 1)[0];
  if (!first.endsWith(' -->')) throw new Error('Incomplete evaluation sample receipt');
  const receipt = JSON.parse(first.slice(markers.receipt.length, -4));
  if (receipt.version !== 1 || receipt.issueNumber !== issueNumber || !segment.test(receipt.batchKey ?? '') ||
      !segment.test(receipt.caseKey ?? '') || !positive(receipt.sampleIndex) || receipt.sampleKey !== `${receipt.batchKey}/${receipt.caseKey}/${receipt.sampleIndex}` ||
      !positive(receipt.coordinatorIssue) || !/^[a-f0-9]{64}$/.test(receipt.manifestHash ?? '') || !sha.test(receipt.controlSha ?? '') || !sha.test(receipt.baseSha ?? ''))
    throw new Error('Invalid evaluation sample receipt');
  return { receipt, comment: found[0] };
}
export const claimsOf = (comments, sampleKey) => comments.filter(c => isBot(c.user))
  .map(c => new RegExp(`<!-- factory-evaluation-sample-claim:${sampleKey.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}:(\\d+) -->$`).exec(c.body ?? '')?.[1])
  .filter(Boolean).map(Number);

async function listComments(client, number) {
  const values = [];
  for (let page = 1; page <= 50; page++) {
    const batch = await client.request('GET', `/issues/${number}/comments`, { query: { per_page: 100, page } });
    values.push(...batch);
    if (batch.length < 100) return values;
  }
  throw new Error('Comment pagination limit reached');
}

// Returns null for ordinary Issues. Throws when a sample Issue cannot prove its batch.
export async function resolveSample(client, issueNumber, { issue } = {}) {
  issue ??= await client.request('GET', `/issues/${issueNumber}`);
  if (!isSampleIssue(issue)) return null;
  if (!isBot(issue.user) || issue.pull_request) throw new Error('Evaluation sample Issues are created only by the batch coordinator');
  const comments = await listComments(client, issueNumber);
  const found = readSampleReceipt(comments, issueNumber);
  if (!found) throw new Error('Evaluation sample receipt is missing or ambiguous');
  const { receipt } = found;
  if (!(issue.body ?? '').includes(markers.sample(receipt.sampleKey))) throw new Error('Sample Issue body does not carry its sample marker');
  const coordinator = await client.request('GET', `/issues/${receipt.coordinatorIssue}`);
  if (!isBot(coordinator.user) || coordinator.pull_request || !labels(coordinator).includes(BATCH_LABEL) || !labels(coordinator).includes(MANUAL_LABEL) ||
      !(coordinator.body ?? '').includes(markers.batch(receipt.batchKey))) throw new Error('Batch coordinator Issue is not trusted');
  const batchComments = await listComments(client, receipt.coordinatorIssue);
  const loaded = readManifest(batchComments);
  if (!loaded || loaded.hash !== receipt.manifestHash) throw new Error('Batch manifest is missing or differs from the sample receipt');
  const { manifest } = loaded;
  const planned = manifest.samples.find(s => s.key === receipt.sampleKey);
  if (manifest.batchKey !== receipt.batchKey || manifest.repository !== client.repository || manifest.coordinatorIssue !== receipt.coordinatorIssue ||
      manifest.controlSha !== receipt.controlSha || manifest.applicationBaseSha !== receipt.baseSha || !planned ||
      planned.caseKey !== receipt.caseKey || planned.sampleIndex !== receipt.sampleIndex) throw new Error('Sample receipt does not match its batch manifest');
  const state = readState(batchComments, manifest.batchKey, loaded.hash)?.state;
  if (state?.samples?.[receipt.sampleKey]?.issue !== issueNumber) throw new Error('Batch state does not assign this Issue to the sample');
  return { receipt, manifest, manifestHash: loaded.hash, cancelled: state.cancelled === true, comments };
}

// One build per sample. Returns false for a duplicate or reordered dispatch;
// a re-run attempt of the claiming Run and continuations keep their claim.
export async function claimSample(client, sample, runId, serverUrl = 'https://github.com') {
  if (!positive(runId)) throw new Error('Invalid claiming run ID');
  const key = sample.receipt.sampleKey;
  const claims = claimsOf(sample.comments, key);
  if (claims.length) return claims.includes(runId);
  const comment = await client.addComment(sample.receipt.issueNumber,
    `开始执行评测样本 \`${key}\`：[本轮 Actions](${serverUrl}/${client.repository}/actions/runs/${runId})。重复派发不会再次搭建同一样本。\n\n${markers.claim(key, runId)}`);
  sample.comments.push(comment);
  return true;
}

// Budget consumption from GitHub's own job records, not the Agent-writable
// checkpoint: every earlier Agent execution of this sample (continuations,
// recoveries and re-run attempts) and its wall-clock duration.
export async function sampleUsage(client, issueNumber, { runId, attempt = 1, since = null, now = Date.now() } = {}) {
  let activeSeconds = 0, executions = 0;
  for (let page = 1; page <= 10; page++) {
    const { workflow_runs: runs } = await client.request('GET', '/actions/workflows/code-agent-task.yml/runs',
      { query: { ...(since ? { created: `>=${since}` } : {}), per_page: 100, page } });
    for (const run of runs.filter(item => item.display_title?.startsWith(`Factory issue #${issueNumber} build 0 `))) {
      const { jobs } = await client.request('GET', `/actions/runs/${run.id}/jobs`, { query: { filter: 'all', per_page: 100 } });
      for (const job of jobs.filter(item => item.name === 'agent' && item.started_at && item.conclusion !== 'skipped')) {
        if (run.id === runId && Number(job.run_attempt ?? 1) >= attempt) continue;
        const start = Date.parse(job.started_at), end = Date.parse(job.completed_at ?? '') || now;
        if (!Number.isFinite(start)) continue;
        executions++;
        activeSeconds += Math.max(0, Math.round((end - start) / 1000));
      }
    }
    if (runs.length < 100) break;
  }
  return { activeSeconds, executions };
}

// A decision made at prepare (not by a build) is recorded for the coordinator.
export async function recordTerminal(client, sample, runId, state, reason) {
  if (!TERMINAL_DECISIONS.includes(state) || !positive(runId)) throw new Error('Invalid sample terminal decision');
  const value = { version: 1, sampleKey: sample.receipt.sampleKey, runId, state };
  const comment = await client.addComment(sample.receipt.issueNumber, `${markers.terminal}${JSON.stringify(value)} -->\n\n${reason}`);
  sample.comments?.push(comment);
  return comment;
}
export function readTerminals(comments, sampleKey) {
  const found = new Map();
  for (const comment of comments.filter(c => isBot(c.user) && (c.body ?? '').startsWith(markers.terminal))) {
    try {
      const first = comment.body.split(/\r?\n/, 1)[0];
      const value = JSON.parse(first.slice(markers.terminal.length, -4));
      if (value.version === 1 && value.sampleKey === sampleKey && positive(value.runId) && TERMINAL_DECISIONS.includes(value.state)) found.set(value.runId, value.state);
    } catch { /* Not a terminal receipt. */ }
  }
  return found;
}

// The frozen control SHA must be a commit of the default branch history, not an arbitrary ref.
export async function verifyAncestor(client, controlSha, defaultBranch) {
  const comparison = await client.request('GET', `/compare/${controlSha}...${encodeURIComponent(defaultBranch)}`);
  if (!['identical', 'ahead'].includes(comparison?.status)) throw new Error('Frozen control SHA is not in the default branch history');
}

class FetchClient {
  constructor({ token, repository, apiUrl = 'https://api.github.com' }) { Object.assign(this, { token, repository, apiUrl: apiUrl.replace(/\/$/, '') }); }
  async request(method, route, { query } = {}) {
    const url = new URL(`${this.apiUrl}/repos/${this.repository}${route}`);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, String(value));
    const response = await fetch(url, { method, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`,
      'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`GitHub API ${method} ${route} failed (${response.status})`);
    return response.json();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, '')] = rest[i + 1];
  if (command !== 'pin' || !positive(Number(args.issue)) || !args.output) throw new Error('Usage: evaluation-sample.mjs pin --issue N --output FILE');
  const client = new FetchClient({ token: process.env.GITHUB_TOKEN, repository: process.env.GITHUB_REPOSITORY, apiUrl: process.env.GITHUB_API_URL });
  const sample = await resolveSample(client, Number(args.issue));
  if (!sample) {
    appendFileSync(args.output, 'sample=false\n');
  } else {
    const { default_branch: defaultBranch } = await client.request('GET', '');
    await verifyAncestor(client, sample.receipt.controlSha, defaultBranch);
    appendFileSync(args.output, `sample=true\ncontrol_sha=${sample.receipt.controlSha}\n`);
    console.error(`Evaluation sample ${sample.receipt.sampleKey}: frozen factory ${sample.receipt.controlSha}.`);
  }
}

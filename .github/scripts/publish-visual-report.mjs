import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { collectMedia, matchesTaskPR, readJson, renderReport, selectArtifact, writeMediaPlan } from './visual-report.mjs';

const [mode, ...argv] = process.argv.slice(2);
const args = Object.fromEntries(Array.from({ length: argv.length / 2 }, (_, i) => [argv[i * 2].replace(/^--/, ''), argv[i * 2 + 1]]));
const repository = process.env.GITHUB_REPOSITORY;
if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw new Error('Invalid repository');
const runId = Number(args['run-id']);
if (!Number.isSafeInteger(runId) || runId < 1) throw new Error('Invalid source run ID');
const runUrl = `https://github.com/${repository}/actions/runs/${runId}`;
const output = (name, value) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);

async function api(method, route, body) {
  const response = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repository}${route}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: globalThis.AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub ${method} failed (${response.status})`);
  return response.status === 204 ? null : response.json();
}

async function list(route, key) {
  const result = [];
  for (let page = 1; page <= 30; page++) {
    const response = await api('GET', `${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const items = key ? response[key] : response;
    if (!Array.isArray(items)) throw new Error('Invalid GitHub list response');
    result.push(...items);
    if (items.length < 100) return result;
  }
  throw new Error('GitHub pagination limit reached');
}

if (mode === 'select') {
  output('ready', 'false');
  const run = await api('GET', `/actions/runs/${runId}`);
  const repo = await api('GET', '');
  if (run.head_branch !== repo.default_branch) throw new Error('Media publishing only accepts default-branch task runs');
  const jobs = await list(`/actions/runs/${runId}/attempts/${run.run_attempt}/jobs`, 'jobs');
  const artifacts = await list(`/actions/runs/${runId}/artifacts`, 'artifacts');
  const artifact = selectArtifact(run, jobs, artifacts, repository);
  if (artifact) {
    output('artifact', artifact.name);
    writeFileSync(args.source, JSON.stringify({ repository, runId, runUrl, runAttempt: run.run_attempt, artifact }));
    output('ready', 'true');
  } else console.log('No successful business delivery; skipping visual report.');
} else if (mode === 'prepare') {
  output('ready', 'false');
  const source = JSON.parse(readFileSync(args.source, 'utf8'));
  if (source.repository !== repository || source.runId !== runId) throw new Error('Source mismatch');
  const metadata = readJson(args.artifacts, 'task-metadata.json');
  const issue = metadata.issue?.number;
  if (metadata.repository !== repository || !Number.isSafeInteger(issue) || issue < 1 ||
      source.artifact.name !== `factory-agent-${issue}` ||
      ![`agent/issue-${issue}`, `pi/issue-${issue}`].includes(metadata.workBranch) ||
      !/^apps\/[a-z0-9][a-z0-9./_-]*$/.test(metadata.task?.targetBranch ?? '')) throw new Error('Task metadata mismatch');
  const pulls = await list(`/pulls?state=all&head=${encodeURIComponent(`${repository.split('/')[0]}:${metadata.workBranch}`)}`);
  const pr = pulls.find(p => matchesTaskPR(p, metadata, source));
  if (!pr) {
    console.log('No matching PR for this run, or the PR was updated; skipping stale media.');
  } else {
    const plan = {
      ...collectMedia(args.artifacts, args.output),
      repository, runId, runUrl, runAttempt: source.runAttempt, prNumber: pr.number,
      headSha: pr.body.includes(`<!-- agent-head-sha: ${pr.head.sha} -->`) ? pr.head.sha : null,
      sourceArtifactUrl: `${runUrl}/artifacts/${source.artifact.id}`,
    };
    writeMediaPlan(args.output, plan);
    output('ready', 'true');
  }
} else if (mode === 'publish') {
  const plan = readJson(args.output, 'publication.json');
  if (plan.repository !== repository || plan.runId !== runId || !Number.isSafeInteger(plan.prNumber)) throw new Error('Publication plan mismatch');
  plan.mediaArtifactUrl = process.env.FACTORY_MEDIA_ARTIFACT_URL || plan.sourceArtifactUrl;
  const pr = await api('GET', `/pulls/${plan.prNumber}`);
  if (!pr.body?.includes(`- [GitHub Actions 运行记录](${runUrl})`) || (plan.headSha && pr.head?.sha !== plan.headSha)) {
    console.log('PR changed since collection; refusing stale media.');
    process.exit(0);
  }
  const marker = `<!-- factory-visual-report:${runId}:${plan.runAttempt} -->`;
  const comments = () => list(`/issues/${plan.prNumber}/comments`);
  let existing = (await comments()).filter(c => c.body?.includes(marker));
  const complete = c => c.body.includes('<!-- factory-visual-mode:inline -->');
  let uploaded = existing.some(complete);
  let reason = '未配置 FACTORY_MEDIA_TOKEN；截图和录像已保存在媒体包中，配置后可单独补发。';
  if (!uploaded && process.env.FACTORY_MEDIA_TOKEN && plan.media.length) {
    const gh = process.env.FACTORY_GH_PATH || 'gh';
    const env = { ...process.env, GH_TOKEN: process.env.FACTORY_MEDIA_TOKEN, GITHUB_TOKEN: '', FACTORY_MEDIA_TOKEN: '', GH_PROMPT_DISABLED: '1' };
    const help = spawnSync(gh, ['pr', 'comment', '--help'], { env, encoding: 'utf8', timeout: 15_000 });
    if (help.status === 0 && help.stdout.includes('--attach')) {
      writeFileSync(path.join(args.output, 'comment.md'), renderReport(plan, true));
      for (let attempt = 1; attempt <= 2 && !uploaded; attempt++) {
        const result = spawnSync(gh, [
          'pr', 'comment', String(plan.prNumber), '--repo', repository, '--body-file', 'comment.md',
          ...plan.media.flatMap(m => ['--attach', `./${m.name}`]),
        ], { cwd: path.resolve(args.output), env, encoding: 'utf8', timeout: 180_000, killSignal: 'SIGKILL', maxBuffer: 1_000_000 });
        // Even on a network timeout the server may have posted the comment.
        existing = (await comments()).filter(c => c.body?.includes(marker));
        uploaded = existing.some(complete);
        if (result.status === 0 || uploaded) { uploaded = true; break; }
        console.warn(`::warning::Attachment publication attempt ${attempt} failed; retaining the media artifact.`);
        if (attempt < 2) await sleep(2_000);
      }
      reason = '原生附件上传失败（请检查 Token 类型、权限或有效期）；媒体包仍可下载，业务交付不受影响。';
    } else reason = 'GitHub CLI 附件功能不可用；媒体包仍可下载，稍后可单独补发。';
  }
  const fallback = existing.find(c => c.user?.login === 'github-actions[bot]' && !complete(c));
  if (uploaded) {
    if (fallback) await api('DELETE', `/issues/comments/${fallback.id}`);
    console.log(`Visual report published for PR #${plan.prNumber}.`);
  } else {
    if (!plan.media.length) reason = '本轮没有可发布的媒体文件，请查看原始验收 Artifact。';
    const body = renderReport(plan, false, reason);
    await api(fallback ? 'PATCH' : 'POST', fallback ? `/issues/comments/${fallback.id}` : `/issues/${plan.prNumber}/comments`, { body });
    console.warn(`::warning::${reason}`);
  }
} else throw new Error('Usage: publish-visual-report.mjs <select|prepare|publish> --run-id N ...');

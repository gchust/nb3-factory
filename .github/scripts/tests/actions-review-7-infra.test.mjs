// Round 7 of the Actions review: re-runs, retried reads and skipped work in
// the review, evaluation, framework-fix and template workflows.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { openPullRequest, tokenIdentity } from '../framework-fix.mjs';
import { selectSupplement } from '../replay-build-review.mjs';
import { selectReplayHistory } from '../replay-review-history.mjs';
import { isReviewMarker } from '../independent-review.mjs';
import { fetchTaxonomy } from '../problem-classification.mjs';
import { newerQueuedRun } from '../classify-findings.mjs';

const workflow = (name) =>
  readFileSync(new URL(`../../workflows/${name}`, import.meta.url), 'utf8');
const jobOf = (text, name) =>
  text.split(`\n  ${name}:\n`)[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];
const response = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

test('a claimed framework problem is always reported, even if the claim job failed after claiming', () => {
  const text = workflow('framework-fix.yml');
  const publish = jobOf(text, 'publish');
  // run_id is written only once TestManage accepted the claim.
  assert.match(
    publish,
    /if: \$\{\{ !cancelled\(\) && needs\.claim\.outputs\.run_id != '' \}\}/,
  );
  const input = publish
    .split('name: framework-fix-input-')[0]
    .split('- uses: actions/download-artifact@')
    .pop();
  assert.match(input, /continue-on-error: true/);
  assert.match(
    publish,
    /- name: Report the result to TestManage\n {8}if: always\(\)/,
  );
});

test('framework-fix finds the PR a lost response created and retries reading the token account', async () => {
  const pull = [{ html_url: 'https://github.com/nocobase/nocobase3/pull/9' }];
  for (const first of [
    () => {
      throw new TypeError('fetch failed');
    },
    () => response(502, {}),
  ]) {
    const calls = [];
    const url = await openPullRequest({
      token: 't',
      branch: 'fix/b',
      base: 'develop',
      title: 'T',
      body: 'B',
      delayMs: 0,
      fetchImpl: async (u, o) => {
        calls.push(o.method);
        return calls.length === 1 ? first() : response(200, pull);
      },
    });
    assert.equal(url, pull[0].html_url);
    assert.deepEqual(calls, ['POST', 'GET'], 'the POST is never repeated');
  }
  // A plain refusal is still an error, with no lookup.
  const calls = [];
  await assert.rejects(
    openPullRequest({
      token: 't',
      branch: 'fix/b',
      base: 'develop',
      title: 'T',
      body: 'B',
      delayMs: 0,
      fetchImpl: async (u, o) => {
        calls.push(o.method);
        return response(403, { message: 'no' });
      },
    }),
    /403/,
  );
  assert.deepEqual(calls, ['POST']);

  let reads = 0;
  const identity = await tokenIdentity({
    token: 't',
    delayMs: 0,
    fetchImpl: async () =>
      ++reads < 3 ? response(503, {}) : response(200, { login: 'bot', id: 7 }),
  });
  assert.equal(identity.email, '7+bot@users.noreply.github.com');
  assert.equal(reads, 3);
});

test('a re-run report adopts the review from the attempt that produced it', async () => {
  const created = '2026-10-07T01:30:00Z';
  const responses = {
    '/actions/runs/200': {
      path: '.github/workflows/replay-build-review.yml',
      head_repository: { full_name: 'owner/factory' },
      head_sha: 'c'.repeat(40),
      run_attempt: 2,
    },
    '/actions/artifacts/84': {
      name: 'factory-build-review-200-1',
      workflow_run: { id: 200 },
      created_at: created,
    },
    '/actions/runs/200/attempts/1/jobs?per_page=100': {
      jobs: [
        {
          name: 'review',
          status: 'completed',
          started_at: '2026-10-07T01:00:00Z',
          completed_at: '2026-10-07T02:00:00Z',
        },
      ],
    },
  };
  const get = async (route) => responses[route];
  const selected = await selectSupplement(get, 'owner/factory', 200, 84);
  assert.equal(selected.attempt, 1);
  // A name from a later attempt than the run has, or another run, is refused.
  responses['/actions/artifacts/84'].name = 'factory-build-review-200-3';
  await assert.rejects(
    selectSupplement(get, 'owner/factory', 200, 84),
    /attempt/,
  );
  responses['/actions/artifacts/84'].name = 'factory-build-review-201-1';
  await assert.rejects(
    selectSupplement(get, 'owner/factory', 200, 84),
    /attempt/,
  );
});

test('the replay history archives the review of an earlier attempt after a report re-run', () => {
  const run = {
    id: 200,
    run_attempt: 2,
    path: '.github/workflows/replay-build-review.yml',
    status: 'completed',
    event: 'workflow_dispatch',
    head_repository: { full_name: 'owner/factory' },
  };
  const review = {
    id: 77,
    run_attempt: 1,
    name: 'review',
    conclusion: 'success',
    started_at: '2026-01-01T00:01:00Z',
    completed_at: '2026-01-01T00:05:00Z',
    steps: [],
  };
  const artifact = {
    id: 88,
    name: 'factory-build-review-200-1',
    created_at: '2026-01-01T00:04:00Z',
    expired: false,
  };
  const source = selectReplayHistory(
    run,
    [
      review,
      {
        id: 78,
        run_attempt: 2,
        name: 'report',
        started_at: '2026-01-01T01:00:00Z',
        conclusion: 'success',
      },
    ],
    [artifact],
    'owner/factory',
    { runId: 200, attempt: 2 },
  );
  assert.equal(source.artifacts[0].id, 88);
  assert.equal(source.attempt, 2);
  // A newer review in attempt 2 wins over attempt 1's.
  const newer = {
    ...review,
    id: 79,
    run_attempt: 2,
    started_at: '2026-01-01T02:00:00Z',
    completed_at: '2026-01-01T02:05:00Z',
  };
  const second = {
    id: 89,
    name: 'factory-build-review-200-2',
    created_at: '2026-01-01T02:04:00Z',
    expired: false,
  };
  assert.equal(
    selectReplayHistory(
      run,
      [review, newer],
      [artifact, second],
      'owner/factory',
      { runId: 200, attempt: 2 },
    ).artifacts[0].id,
    89,
  );
});

test('replay review downloads the bound factory-agent-N by ID instead of a re-uploaded copy', () => {
  const text = workflow('replay-build-review.yml');
  const prepare = jobOf(text, 'prepare');
  const review = jobOf(text, 'review');
  assert.match(
    prepare,
    /agent_artifact: \$\{\{ steps\.select\.outputs\.artifact \}\}/,
  );
  assert.match(
    prepare,
    /path: \|\n\s+input\/selected\.json\n\s+input\/binding\.json\n/,
  );
  assert.doesNotMatch(prepare, /\n {10}path: input\n/);
  assert.match(
    review,
    /artifact-ids: \$\{\{ needs\.prepare\.outputs\.agent_artifact \}\}\n\s+merge-multiple: true\n\s+run-id: \$\{\{ needs\.prepare\.outputs\.source_run \}\}/,
  );
  assert.match(
    review,
    /permissions:\n\s+contents: read\n(?:\s+#.*\n)*\s+actions: read/,
  );
  // An empty ID would download every artifact of the source run.
  assert.match(review, /needs\.prepare\.outputs\.agent_artifact != ''/);
  assert.match(review, /binding\.artifactId\), process\.env\.AGENT_ARTIFACT/);
});

test('one review comment per run, also found by its older attempt-keyed marker', () => {
  assert.equal(
    isReviewMarker('<!-- factory-independent-review:500 -->\nbody', 500),
    true,
  );
  assert.equal(
    isReviewMarker('<!-- factory-independent-review:500:2 -->\nbody', 500),
    true,
  );
  assert.equal(
    isReviewMarker('<!-- factory-independent-review:5000 -->', 500),
    false,
  );
  assert.equal(
    isReviewMarker('text <!-- factory-independent-review:500 -->', 500),
    false,
  );
  const source = readFileSync(
    new URL('../independent-review.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /const api = repositoryApi\(\);/);
  assert.doesNotMatch(source, /await fetch\(/);
});

test('one receiver blip no longer sends every problem unclassified', async () => {
  const env = {
    EVALUATION_ENDPOINT: 'https://test3.example/main/api/evaluations/import',
    EVALUATION_TOKEN: 'k',
  };
  const body = { version: 1, featurePoints: [] };
  let calls = 0;
  const taxonomy = await fetchTaxonomy(env, {
    delays: [0, 0],
    fetcher: async () => {
      calls++;
      if (calls === 1) throw new TypeError('fetch failed');
      return calls === 2
        ? new Response('', { status: 503 })
        : response(200, body);
    },
  });
  assert.deepEqual(taxonomy, body);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(
    fetchTaxonomy(env, {
      delays: [0, 0],
      fetcher: async () => {
        calls++;
        return new Response('', { status: 401 });
      },
    }),
    /401/,
  );
  assert.equal(calls, 1, 'a refusal is not retried');
  const notice = workflow('deliver-evaluation.yml')
    .split('- name: Report problems left unclassified')[1]
    .split('\n      - ')[0];
  assert.match(notice, /steps\.taxonomy\.outcome == 'failure'/);
});

test('a classification a queued run would supersede is skipped before the model call', () => {
  const runs = [
    { id: 10, status: 'completed' },
    { id: 12, status: 'in_progress' },
    { id: 13, status: 'pending' },
  ];
  assert.equal(newerQueuedRun(runs, 12)?.id, 13);
  assert.equal(newerQueuedRun(runs, 13), null);
  assert.equal(
    newerQueuedRun([{ id: 9, status: 'pending' }], 12),
    null,
    'an older waiting run does not count',
  );
  const classify = jobOf(workflow('classify-findings.yml'), 'classify');
  const steps = classify.split('\n      - ');
  const check = steps.findIndex((s) =>
    s.startsWith('name: Check the prepared findings are still current'),
  );
  const model = steps.findIndex((s) =>
    s.startsWith('name: Classify findings with the selected Agent'),
  );
  const install = steps.findIndex((s) =>
    s.startsWith('name: Install selected pinned classifier'),
  );
  assert.ok(
    install < check && check < model,
    'the check runs right before the model call',
  );
  assert.match(steps[check], /classify-findings\.mjs check/);
  assert.match(
    steps[model],
    /if: steps\.prepare\.outputs\.ready == 'true' && steps\.check\.outputs\.current == 'true'/,
  );
  assert.match(
    classify,
    /permissions:\n\s+contents: read\n(?:\s+#.*\n)*\s+actions: read/,
  );
});

test('template checks skip build task PRs and superseded source-baseline runs', () => {
  const refresh = workflow('refresh-template.yml');
  assert.match(
    jobOf(refresh, 'generate'),
    /github\.event_name == 'pull_request' && !startsWith\(github\.head_ref, 'agent\/issue-'\)/,
  );
  const baseline = workflow('source-baseline.yml');
  assert.match(
    baseline,
    /on:\n {2}pull_request:\n(?: {4}#.*\n)* {4}branches: \[develop\]\n/,
  );
  const supersede = jobOf(baseline, 'supersede');
  assert.match(
    supersede,
    /if: github\.event_name == 'pull_request' && !startsWith\(github\.head_ref, 'agent\/issue-'\)/,
  );
  assert.match(
    supersede,
    /gh api "repos\/\$GITHUB_REPOSITORY\/pulls\/\$PR_NUMBER" --jq \.head\.sha \|\| true/,
  );
  const verify = jobOf(baseline, 'source-baseline');
  assert.match(verify, /needs: supersede/);
  assert.match(verify, /!cancelled\(\)/);
  assert.match(
    verify,
    /needs\.supersede\.result == 'success' && needs\.supersede\.outputs\.superseded != 'true'/,
  );
  // A dispatch still requires the owner on the default branch.
  assert.match(
    verify,
    /github\.event_name != 'pull_request' &&\s+github\.actor == github\.repository_owner/,
  );
});

test('every network step of the template checks has a bound below its job limit', () => {
  const refresh = workflow('refresh-template.yml');
  assert.match(
    refresh,
    /- name: Create a fresh application from the latest published template\n(?: {8}.*\n)*? {8}timeout-minutes: 10\n/,
  );
  const baseline = workflow('source-baseline.yml');
  for (const [name, minutes] of [
    ['Build and publish only to an isolated loopback registry', 25],
    ['Verify an application made from these exact source packages', 15],
  ])
    assert.match(
      baseline,
      new RegExp(
        `- name: ${name}\\n(?: {8}.*\\n)*? {8}timeout-minutes: ${minutes}\\n`,
      ),
      name,
    );
  const plugins = readFileSync(
    new URL('../template-plugins.mjs', import.meta.url),
    'utf8',
  );
  assert.match(plugins, /timeout: 12 \* 60 \* 1000/);
  assert.match(
    refresh,
    /- name: Install, register, and inspect the required Pro plugin baseline\n {8}timeout-minutes: 15\n/,
  );
});

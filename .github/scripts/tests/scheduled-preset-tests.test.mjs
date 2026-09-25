import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getPresetSourceNumber, preparePresetIssue } from '../issue-presets.mjs';
import { DAILY_PRESET_LABEL, initializeDailyLabel, renderSummary, runPresetTests } from '../scheduled-preset-tests.mjs';

const bot = { login: 'github-actions[bot]', type: 'Bot' };
const names = (issue) => (issue.labels ?? []).map((label) => label.name ?? label);
const selectionBody = (number) => `### 预置案例\n\n#${number} - 案例\n`;
const preparedBody = (number) => `<!-- factory-preset-ready:${'a'.repeat(64)} -->\n` +
  `> 复制自[预置案例 #${number}](https://github.com/owner/repo/issues/${number})。人工评论按原顺序复制；一次性搭建，不逐轮回放。\n\n业务正文`;
const task = (number, overrides = {}) => ({
  number, body: selectionBody(176), state: 'open', labels: ['agent:running'],
  user: bot, updated_at: '2026-09-20T00:00:00Z', ...overrides,
});
const preset = (number, overrides = {}) => ({
  number, title: `案例 ${number}`, body: '### 任务类型\n\n创建新系统\n\n### 业务需求\n\n业务需求\n\n### 验收要求\n\n验证页面', state: 'closed',
  html_url: `https://github.com/owner/repo/issues/${number}`, updated_at: '2026-09-20T00:00:00Z',
  labels: [{ name: 'factory:preset' }, { name: DAILY_PRESET_LABEL }],
  user: { login: 'owner', type: 'User' }, ...overrides,
});

function fixture(sources = [preset(176)]) {
  const state = { sources, tasks: [], comments: new Map(), labels: new Set(), calls: [], runs: [], fail: null };
  const client = {
    repository: 'owner/repo',
    async getRepository() { return { default_branch: 'develop' }; },
    async getIssue(number) {
      return structuredClone([...state.sources, ...state.tasks].find((issue) => issue.number === number));
    },
    async ensureStatusLabels() { state.calls.push({ method: 'ENSURE', route: '/labels' }); },
    async addComment(number, body) {
      return this.request('POST', `/issues/${number}/comments`, { body: { body } });
    },
    async request(method, route, options = {}) {
      state.calls.push({ method, route, ...structuredClone(options) });
      if (state.fail?.(method, route, options)) throw new Error('Injected API failure');
      if (method === 'GET' && /^\/actions\/runs\/\d+$/.test(route)) {
        return { created_at: '2026-09-24T03:17:00Z', run_started_at: '2026-09-25T03:17:00Z' };
      }
      if (method === 'GET' && route.endsWith('/runs')) {
        const offset = (options.query.page - 1) * 100;
        return { workflow_runs: state.runs.slice(offset, offset + 100) };
      }
      if (route.startsWith('/labels/') && method === 'GET') {
        return state.labels.has(decodeURIComponent(route.slice(8))) ? {} : null;
      }
      if (route === '/labels' && method === 'POST') {
        state.labels.add(options.body.name);
        return options.body;
      }
      if (route === '/issues' && method === 'GET') {
        const required = options.query.labels?.split(',') ?? [];
        const found = [...state.sources, ...state.tasks].filter((issue) =>
          required.every((label) => names(issue).includes(label)) &&
          (options.query.state === 'all' || issue.state === options.query.state) &&
          (!options.query.since || issue.updated_at >= options.query.since));
        const offset = (options.query.page - 1) * 100;
        return structuredClone(found.slice(offset, offset + 100));
      }
      if (route === '/issues' && method === 'POST') {
        const issue = { ...structuredClone(options.body), number: 1000 + state.tasks.length, state: 'open', user: bot, updated_at: '2026-09-24T03:17:01Z' };
        state.tasks.push(issue);
        return structuredClone(issue);
      }
      if (method === 'PATCH' && /^\/issues\/\d+$/.test(route)) {
        const issue = state.tasks.find((item) => item.number === Number(route.split('/').at(-1)));
        Object.assign(issue, options.body);
        return structuredClone(issue);
      }
      const commentsMatch = /^\/issues\/(\d+)\/comments$/.exec(route);
      if (commentsMatch) {
        const number = Number(commentsMatch[1]);
        const comments = state.comments.get(number) ?? [];
        if (method === 'GET') {
          const offset = (options.query.page - 1) * 100;
          return structuredClone(comments.slice(offset, offset + 100));
        }
        const comment = { id: number * 1000 + comments.length, body: options.body.body, user: bot };
        comments.push(comment);
        state.comments.set(number, comments);
        return structuredClone(comment);
      }
      if (route.startsWith('/issues/comments/') && method === 'PATCH') {
        const id = Number(route.split('/').at(-1));
        const comment = [...state.comments.values()].flat().find((item) => item.id === id);
        Object.assign(comment, options.body);
        return structuredClone(comment);
      }
      if (route.endsWith('/dispatches') && method === 'POST') {
        state.runs.push({ display_title: `Factory issue #${options.body.inputs.issue_number} build 0 from 0` });
        return null;
      }
      throw new Error(`Unexpected API call: ${method} ${route}`);
    },
  };
  return { client, state, execute: (options = {}) => runPresetTests({ client, runId: '900', ...options }) };
}

const dispatches = (state) => state.calls.filter((call) => call.route.endsWith('/dispatches'));
const writes = (state) => state.calls.filter((call) => call.method !== 'GET');

test('without daily presets the automatic scan reads labels but performs no writes or builds', async () => {
  const { execute, state } = fixture([preset(176, { labels: ['factory:preset'] })]);
  const result = await execute();
  assert.deepEqual(result.rows, []);
  assert.equal(writes(state).length, 0);
  assert.equal(state.calls.length, 1);
  assert.deepEqual(state.calls[0].query, {
    state: 'all', labels: 'factory:preset,factory:daily', sort: 'created', direction: 'asc', per_page: 100, page: 1,
  });
  assert.match(renderSummary(result), /factory:daily/);
  assert.match(renderSummary(result), /没有创建 Issue/);
});

test('only the intersection of preset and daily labels selects cases; unrelated labels do not opt in', async () => {
  const { execute, state } = fixture([
    preset(176), preset(155, { labels: ['factory:preset'] }),
    preset(156, { labels: ['factory:daily'] }), preset(157, { labels: [] }),
    preset(158, { labels: ['factory:preset', 'factory:test-preset-176'] }),
  ]);
  const result = await execute();
  assert.deepEqual(result.rows.map((row) => row.preset), [176]);
  assert.equal(dispatches(state).length, 1);
});

test('mislabelled PRs, bots and manual tasks are reported without building or suppressing valid daily cases', async () => {
  for (const overrides of [
    { pull_request: {} }, { user: bot }, { user: { login: 'custom[bot]', type: 'User' } },
    { labels: ['factory:preset', 'factory:daily', 'factory:manual'] }, { user: null },
  ]) {
    const { execute, state } = fixture([preset(176), preset(155, overrides)]);
    const result = await execute();
    assert.deepEqual(result.rows.map((row) => row.status), ['error', 'dispatched']);
    assert.match(result.rows[0].message, /人工案例/);
    assert.equal(state.tasks.length, 1);
    assert.match(state.tasks[0].body, /#176/);
  }
});

test('optional dry run includes open and closed daily presets and performs only reads', async () => {
  const { execute, state } = fixture([preset(176), preset(155, { state: 'open' })]);
  const result = await execute({ dryRun: true });
  assert.deepEqual(result.rows.map((row) => row.status), ['planned', 'planned']);
  assert.equal(writes(state).length, 0);
  assert.match(renderSummary(result), /只预览/);
});

test('automatic launch needs no numbers or manual input; builds independent selection-form Issues without inheriting source labels', async () => {
  const sources = [preset(176), preset(155)];
  const original = structuredClone(sources);
  const { execute, state } = fixture(sources);
  const result = await execute();
  assert.deepEqual(result.rows.map((row) => row.status), ['dispatched', 'dispatched']);
  assert.deepEqual(result.rows.map((row) => row.preset), [155, 176]);
  assert.equal(state.tasks.length, 2);
  assert.match(state.tasks[0].body, /### 预置案例\n\n#155\n/);
  assert.deepEqual(state.tasks[0].labels, ['agent:pending']);
  assert.equal(state.labels.size, 0, 'does not create a label for any preset');
  assert.ok(!state.calls.some((call) => JSON.stringify(call).includes('factory:test-preset-')));
  assert.equal(dispatches(state).length, 2);
  assert.deepEqual(dispatches(state)[0].body, { ref: 'develop', inputs: { issue_number: '1000' } });
  assert.match(state.comments.get(1000)[0].body, /factory-preset-test-dispatched:900:155/);
  assert.match(renderSummary(result), /最终验收结果/);
  assert.deepEqual(sources, original);
});

test('removing daily label stops future scheduling without cancelling or modifying the existing task', async () => {
  const { execute, state } = fixture();
  await execute();
  const previousTasks = structuredClone(state.tasks);
  const writeCount = writes(state).length;
  state.sources[0].labels = ['factory:preset'];
  assert.deepEqual((await execute({ runId: '901' })).rows, []);
  assert.equal(writes(state).length, writeCount);
  assert.deepEqual(state.tasks, previousTasks);
});

test('adding daily label selects the case on the next automatic scan; removing preset also opts out', async () => {
  const { execute, state } = fixture([preset(176, { labels: ['factory:preset'] })]);
  assert.deepEqual((await execute()).rows, []);
  state.sources[0].labels.push('factory:daily');
  assert.equal((await execute({ runId: '901' })).rows[0].status, 'dispatched');
  state.sources[0].labels = ['factory:daily'];
  assert.deepEqual((await execute({ runId: '902' })).rows, []);
  assert.equal(dispatches(state).length, 1);
});

test('a new daily round creates a fresh Issue after previous delivery, rather than rerunning the old application', async () => {
  const { execute, state } = fixture();
  await execute();
  state.tasks[0].labels = ['agent:review'];
  state.tasks[0].body = preparedBody(176);
  const result = await execute({ runId: '901' });
  assert.equal(result.rows[0].status, 'dispatched');
  assert.equal(result.rows[0].issue, 1001);
  assert.equal(state.tasks.length, 2);
  assert.match(state.tasks[1].body, /factory-preset-test:901:176/);
  assert.doesNotMatch(state.tasks[1].body, /old generated application/);
  assert.equal(dispatches(state).length, 2);
});

// The fixture gives every launcher the same UTC date. Only a rerun of the
// same run ID is deduplicated; a manual launch must not consume a daily slot.
test('manual launches and scheduled launches create independent rounds on the same day', async () => {
  const sources = [preset(176), preset(155)];
  const original = structuredClone(sources);
  const { execute, state } = fixture(sources);
  for (const [round, runId] of ['900', '901', '902'].entries()) {
    const result = await execute({ runId, dryRun: false });
    assert.deepEqual(result.rows.map((row) => row.status), ['dispatched', 'dispatched']);
    assert.deepEqual(result.rows.map((row) => row.issue), [1000 + round * 2, 1001 + round * 2]);
    // Delivery is complete; an unmerged review PR must not block the next trigger.
    for (const task of state.tasks) {
      task.labels = task.labels.map((label) => label === 'agent:pending' ? 'agent:review' : label);
    }
  }
  assert.equal(dispatches(state).length, 6);
  assert.deepEqual(sources, original);
});

test('manual preview does not persist or turn the next scheduled launch into a preview', async () => {
  const { execute, state } = fixture();
  assert.equal((await execute({ runId: '900', dryRun: true })).rows[0].status, 'planned');
  assert.equal(writes(state).length, 0);
  assert.equal((await execute({ runId: '901' })).rows[0].status, 'dispatched');
  assert.equal(state.tasks.length, 1);
  assert.equal(dispatches(state).length, 1);
});

test('overlapping manual and daily triggers skip active work without disabling future rounds', async () => {
  const { execute, state } = fixture();
  assert.equal((await execute({ runId: '900' })).rows[0].status, 'dispatched');
  assert.equal((await execute({ runId: '901' })).rows[0].status, 'skipped-active');
  assert.equal(dispatches(state).length, 1);
  state.tasks[0].labels = ['agent:review'];
  assert.equal((await execute({ runId: '902' })).rows[0].status, 'dispatched');
  assert.equal(dispatches(state).length, 2);
  assert.deepEqual(names(state.sources[0]), ['factory:preset', 'factory:daily']);
});

test('daily preset discovery paginates beyond 100 and deduplicates issue numbers', async () => {
  const sources = Array.from({ length: 101 }, (_, index) => preset(index + 1));
  const { execute, state } = fixture([...sources, preset(101)]);
  const result = await execute({ dryRun: true });
  assert.equal(result.rows.length, 101);
  assert.equal(result.rows.at(-1).preset, 101);
  const queries = state.calls.filter((call) => call.query?.labels === 'factory:preset,factory:daily');
  assert.deepEqual(queries.map((call) => call.query.page), [1, 2]);
  assert.equal(writes(state).length, 0);
});

test('source discovery failure cannot dispatch a partial list', async () => {
  const { execute, state } = fixture(Array.from({ length: 101 }, (_, index) => preset(index + 1)));
  state.fail = (method, route, options) => route === '/issues' && options.query?.page === 2;
  await assert.rejects(execute(), /Injected API failure/);
  assert.equal(writes(state).length, 0);
});

test('same launcher rerun does not recreate or redispatch after real preset prepare rewrites the body', async () => {
  const { client, execute, state } = fixture();
  await execute();
  await preparePresetIssue(client, await client.getIssue(state.tasks[0].number));
  assert.match(state.tasks[0].body, /复制自\[预置案例 #176\]/);
  const result = await execute();
  assert.equal(result.rows[0].status, 'already-submitted');
  assert.equal(state.tasks.length, 1);
  assert.equal(dispatches(state).length, 1);
});

test('failed dispatch leaves a resumable Issue and reuses it on rerun', async () => {
  const { execute, state } = fixture();
  state.fail = (method, route) => route.endsWith('/dispatches');
  assert.equal((await execute()).rows[0].status, 'error');
  state.fail = null;
  assert.equal((await execute()).rows[0].status, 'dispatched');
  assert.equal(state.tasks.length, 1);
  assert.equal(state.runs.length, 1);
});

test('receipt failure after accepted dispatch is reconciled against actual task runs', async () => {
  const { execute, state } = fixture();
  state.fail = (method, route) => route.startsWith('/issues/comments/') && method === 'PATCH';
  const failed = await execute();
  assert.match(failed.rows[0].message, /已派发，但回执保存失败/);
  state.fail = null;
  assert.equal((await execute()).rows[0].status, 'already-submitted');
  assert.equal(dispatches(state).length, 1);
});

test('pending previous tests block overlap, but review/failed/closed tests allow a fresh round', async () => {
  for (const label of ['agent:pending', 'agent:queued', 'agent:running', 'agent:verifying', 'agent:waiting']) {
    const { execute, state } = fixture();
    state.tasks.push(task(88, { labels: [label] }));
    const result = await execute();
    assert.equal(result.rows[0].status, 'skipped-active');
    assert.equal(result.rows[0].issue, 88);
    assert.equal(writes(state).length, 0);
  }
  for (const [label, issueState] of [['agent:review', 'open'], ['agent:failed', 'open'], ['agent:running', 'closed']]) {
    const { execute, state } = fixture();
    state.tasks.push(task(88, { state: issueState, labels: [label] }));
    assert.equal((await execute()).rows[0].status, 'dispatched');
  }
});

test('a closed same-run task is not reopened or replaced', async () => {
  const { execute, state } = fixture();
  await execute();
  state.tasks[0].state = 'closed';
  assert.equal((await execute()).rows[0].status, 'already-submitted');
  assert.equal(state.tasks.length, 1);
});

test('provenance write failure can recover via the initial body marker', async () => {
  const { execute, state } = fixture();
  state.fail = (method, route) => method === 'POST' && /\/issues\/\d+\/comments$/.test(route);
  assert.equal((await execute()).rows[0].status, 'error');
  assert.equal(dispatches(state).length, 0);
  state.fail = null;
  assert.equal((await execute()).rows[0].status, 'dispatched');
  assert.equal(state.tasks.length, 1);
});

test('one dispatch failure preserves results and does not suppress other daily presets', async () => {
  const { execute, state } = fixture([preset(176), preset(155)]);
  state.fail = (method, route, options) => route.endsWith('/dispatches') && options.body.inputs.issue_number === '1000';
  const result = await execute();
  assert.deepEqual(result.rows.map((row) => row.status), ['error', 'dispatched']);
  assert.match(renderSummary(result), /Injected API failure/);
});

test('pagination reaches an active task beyond the first 100 results', async () => {
  const { execute, state } = fixture();
  state.tasks = Array.from({ length: 101 }, (_, index) => task(index + 1, {
    labels: [index === 100 ? 'agent:running' : 'agent:review'],
  }));
  const result = await execute();
  assert.equal(result.rows[0].status, 'skipped-active');
  assert.equal(result.rows[0].issue, 101);
});

test('label initialization is idempotent and never selects a case or launches a build', async () => {
  const { client, state } = fixture();
  await initializeDailyLabel(client);
  await initializeDailyLabel(client);
  assert.deepEqual([...state.labels], ['factory:daily']);
  assert.equal(writes(state).length, 1);
  assert.equal(writes(state)[0].route, '/labels');
  assert.match(writes(state)[0].body.description, /every day/);
  assert.equal(state.tasks.length, 0);
  assert.equal(dispatches(state).length, 0);
});

test('label initialization tolerates a concurrent creation but propagates actual failures', async () => {
  const { client, state } = fixture();
  state.fail = (method, route, options) => {
    if (method === 'POST' && route === '/labels') {
      state.labels.add(options.body.name);
      return true;
    }
    return false;
  };
  await initializeDailyLabel(client);
  const other = fixture();
  other.state.fail = (method) => method === 'POST';
  await assert.rejects(initializeDailyLabel(other.client), /Injected API failure/);
});

test('summary escapes table and HTML content', () => {
  const summary = renderSummary({ branch: 'develop', rows: [
    { preset: 176, title: '<img> |\nname', status: 'error', issue: 1000, message: '<details> | failure' },
  ] });
  assert.ok(!summary.includes('<img>'));
  assert.match(summary, /&#124;/);
});

test('workflow supports real manual and daily builds together with only optional preview', () => {
  const workflow = readFileSync(new URL('../../workflows/scheduled-preset-tests.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron: '17 3 \* \* \*'/);
  assert.doesNotMatch(workflow, /FACTORY_PRESET_TEST_ISSUES|PRESET_ISSUES|preset_issues|vars\./);
  assert.match(workflow, /if: github.event_name == 'schedule' \|\| github.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /workflow_dispatch:\s+inputs:\s+dry_run:[\s\S]*?default: false\s+type: boolean/);
  assert.match(workflow, /concurrency:\s+group: factory-scheduled-preset-tests\s+cancel-in-progress: false\s+queue: max/);
  assert.match(workflow, /^  schedule:/m);
  assert.match(workflow, /^  workflow_dispatch:/m);
  assert.match(workflow, /run-name:.*'daily'.*'preview'.*'manual'/);
  assert.equal((workflow.match(/run: node \.github\/scripts\/scheduled-preset-tests\.mjs$/gm) ?? []).length, 1);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github.token \}\}/);
  assert.match(workflow, /github.event_name == 'workflow_dispatch' && inputs.dry_run/);
  assert.doesNotMatch(workflow, /secrets\.(?:PAT|GH_TOKEN)/);
});

test('merging initializes only the label on the default branch; pushes and label changes do not start builds', () => {
  const workflow = readFileSync(new URL('../../workflows/scheduled-preset-tests.yml', import.meta.url), 'utf8');
  assert.match(workflow, /push:\s+paths:/);
  assert.match(workflow, /github.event_name == 'push' && github.ref_name == github.event.repository.default_branch/);
  assert.match(workflow, /scheduled-preset-tests\.mjs --init-label/);
  assert.doesNotMatch(workflow, /^  issues:|^  label:/m);
  assert.doesNotMatch(workflow.split('  launch:')[0], /actions: write/);
});

test('manual preset Issues in either preparation state block overlap without any generated label', async () => {
  for (const body of [selectionBody(176), preparedBody(176)]) {
    const { execute, state } = fixture();
    state.tasks.push(task(88, { body, user: { login: 'owner', type: 'User' } }));
    const result = await execute();
    assert.equal(result.rows[0].status, 'skipped-active');
    assert.equal(result.rows[0].issue, 88);
    assert.equal(writes(state).length, 0);
    assert.ok(!state.calls.some((call) => call.route.includes('/comments')), 'active lookup needs only Issue bodies');
  }
});

test('legacy task labels are optional and never override the source in the Issue body', async () => {
  const { execute, state } = fixture([preset(155), preset(176)]);
  state.tasks.push(task(88, {
    body: preparedBody(176), labels: ['agent:running', 'factory:test-preset-155'],
  }));
  assert.deepEqual((await execute()).rows.map((row) => row.status), ['dispatched', 'skipped-active']);
  state.tasks[0].labels = ['agent:running'];
  const result = await execute();
  assert.deepEqual(result.rows.map((row) => row.status), ['already-submitted', 'skipped-active']);
  assert.equal(dispatches(state).length, 1);
  assert.ok(!state.calls.some((call) => JSON.stringify(call).includes('factory:test-preset-')));
});

test('old prepared task receipts still deduplicate after all numbered labels are removed', async () => {
  const { execute, state } = fixture();
  state.tasks.push(task(88, {
    body: preparedBody(176), labels: ['agent:review'], updated_at: '2026-09-24T03:17:01Z',
  }));
  state.comments.set(88, [{ id: 100, user: bot,
    body: '<!-- factory-preset-test:900:176 -->\n\n<!-- factory-preset-test-dispatched:900:176 -->',
  }]);
  const result = await execute();
  assert.equal(result.rows[0].status, 'already-submitted');
  assert.equal(result.rows[0].issue, 88);
  assert.equal(writes(state).length, 0);
});

test('PRs, source presets, maintenance Issues and incidental references cannot block a preset', async () => {
  const { execute, state } = fixture();
  state.tasks.push(
    task(80, { pull_request: {} }),
    task(81, { labels: ['factory:preset', 'agent:running'] }),
    task(82, { labels: ['factory:manual', 'agent:running'] }),
    task(83, { body: '参考 #176，名称与 [预置案例 #176](https://github.com/owner/repo/issues/176) 一致。' }),
    task(84, { body: selectionBody(1760), title: '重搭 #176' }),
    task(85, { body: '', labels: ['factory:test-preset-176', 'agent:running'] }),
  );
  assert.equal((await execute()).rows[0].status, 'dispatched');
  assert.equal(dispatches(state).length, 1);
});

test('open and recent tasks are each scanned once per batch, not once per preset', async () => {
  const { execute, state } = fixture([preset(155), preset(176), preset(200)]);
  await execute();
  const taskQueries = state.calls.filter((call) => call.method === 'GET' && call.route === '/issues' && !call.query.labels);
  assert.equal(taskQueries.length, 2);
  assert.deepEqual(taskQueries.map((call) => call.query.state), ['open', 'all']);
  assert.equal(taskQueries[0].query.since, undefined, 'old active tasks are not cut off');
  assert.equal(taskQueries[1].query.since, '2026-09-24T03:17:00Z', 'retries use original creation time, not run_started_at');
});

test('closed same-run tasks beyond the first page retain their persistent dispatch receipts', async () => {
  const { execute, state } = fixture();
  state.tasks = Array.from({ length: 101 }, (_, index) => task(index + 1, {
    state: 'closed', body: index === 100 ? preparedBody(176) : 'unrelated',
    updated_at: '2026-09-24T03:17:01Z',
  }));
  state.comments.set(101, [
    ...Array.from({ length: 100 }, (_, index) => ({ id: index, user: bot, body: 'previous output' })),
    { id: 101, user: bot, body: '<!-- factory-preset-test:900:176 -->\n\n<!-- factory-preset-test-dispatched:900:176 -->' },
  ]);
  const result = await execute();
  assert.equal(result.rows[0].status, 'already-submitted');
  assert.equal(result.rows[0].issue, 101);
  assert.equal(writes(state).length, 0);
});

test('task discovery errors or broken prepared provenance fail before starting more builds', async () => {
  const { execute, state } = fixture();
  state.fail = (method, route, options) => route === '/issues' && !options.query?.labels;
  await assert.rejects(execute(), /Injected API failure/);
  assert.equal(writes(state).length, 0);
  state.fail = null;
  state.tasks.push(task(88, { body: `<!-- factory-preset-ready:${'a'.repeat(64)} -->\n丢失来源` }));
  await assert.rejects(execute(), /Issue #88.*来源无效/);
  assert.equal(writes(state).length, 0);
});

test('source lookup reads the Issue form and the actual prepared body without adding metadata', async () => {
  const { client, execute, state } = fixture();
  await execute();
  const repositoryUrl = 'https://github.com/owner/repo';
  assert.equal(getPresetSourceNumber(state.tasks[0].body, repositoryUrl), 176);
  assert.equal(getPresetSourceNumber(state.tasks[0].body.replaceAll('\n', '\r\n'), repositoryUrl), 176);
  const prepared = await preparePresetIssue(client, state.tasks[0]);
  assert.equal(getPresetSourceNumber(prepared.issue.body, repositoryUrl), 176);
  assert.equal(getPresetSourceNumber(prepared.issue.body.replaceAll('\n', '\r\n'), repositoryUrl), 176);
  assert.ok(!prepared.issue.body.includes('factory:test-preset-'));
});

test('source lookup ignores ordinary references and rejects invalid preset protocol fields', async () => {
  const repositoryUrl = 'https://github.com/owner/repo';
  assert.equal(getPresetSourceNumber('', repositoryUrl), null);
  assert.equal(getPresetSourceNumber('需求参考 #1 和 [预置案例 #1](https://github.com/test/factory/issues/1)', repositoryUrl), null);
  for (const value of ['#0', '#9007199254740992', '暂无预置案例']) {
    assert.throws(() => getPresetSourceNumber(`### 预置案例\n\n${value}\n`, repositoryUrl), /请选择有效的预置案例/);
  }
  const { client, execute, state } = fixture();
  await execute();
  const { issue } = await preparePresetIssue(client, state.tasks[0]);
  for (const replacement of [
    'https://github.com/another/repository/issues/1',
    'https://github.com.evil.invalid/test/factory/issues/1',
    'https://github.com/owner/repo/issues/1760',
    'https://github.com/owner/repo/issues/176#untrusted',
  ]) {
    assert.throws(() => getPresetSourceNumber(issue.body.replace(state.sources[0].html_url, replacement), repositoryUrl), /来源链接/);
  }
  assert.throws(() => getPresetSourceNumber(issue.body.replace(/^> 复制自.*\n/m, ''), repositoryUrl), /来源链接/);
});

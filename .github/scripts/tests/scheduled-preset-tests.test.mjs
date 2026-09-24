import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parsePresetNumbers, renderSummary, runPresetTests } from '../scheduled-preset-tests.mjs';

const bot = { login: 'github-actions[bot]', type: 'Bot' };
const preset = (number, overrides = {}) => ({
  number, title: `案例 ${number}`, body: '业务需求', state: 'closed',
  labels: [{ name: 'factory:preset' }], user: { login: 'owner', type: 'User' }, ...overrides,
});

function fixture(sources = [preset(176), preset(155)]) {
  const state = { tasks: [], comments: new Map(), labels: new Set(), calls: [], runs: [], fail: null };
  const client = {
    repository: 'owner/repo',
    async getRepository() { return { default_branch: 'develop' }; },
    async getIssue(number) {
      const source = sources.find((item) => item.number === number);
      if (!source) throw new Error(`Issue #${number} not found`);
      return structuredClone(source);
    },
    async ensureStatusLabels() { state.calls.push({ method: 'ENSURE', route: '/labels' }); },
    async addComment(number, body) {
      return this.request('POST', `/issues/${number}/comments`, { body: { body } });
    },
    async request(method, route, options = {}) {
      state.calls.push({ method, route, ...structuredClone(options) });
      if (state.fail?.(method, route, options)) throw new Error('Injected API failure');
      if (method === 'GET' && /^\/actions\/runs\/\d+$/.test(route)) {
        return { created_at: '2026-09-24T03:17:00Z' };
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
        const found = state.tasks.filter((issue) => issue.labels.includes(options.query.labels) &&
          (options.query.state === 'all' || issue.state === options.query.state));
        const offset = (options.query.page - 1) * 100;
        return structuredClone(found.slice(offset, offset + 100));
      }
      if (route === '/issues' && method === 'POST') {
        const issue = { ...structuredClone(options.body), number: 1000 + state.tasks.length, state: 'open', user: bot };
        state.tasks.push(issue);
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
  return { client, state, execute: (options = {}) => runPresetTests({ client, selection: '176', runId: '900', ...options }) };
}

const dispatches = (state) => state.calls.filter((call) => call.route.endsWith('/dispatches'));
const writes = (state) => state.calls.filter((call) => call.method !== 'GET');

// The selector deliberately accepts a list rather than maintaining a second template catalogue.
test('selection accepts multiple IDs, # prefixes, whitespace and Chinese commas; deduplicates in order', () => {
  assert.deepEqual(parsePresetNumbers(' #176，155\n176 #42 '), [176, 155, 42]);
  assert.deepEqual(parsePresetNumbers('   '), []);
  for (const value of ['0', '-1', '1.5', '1e3', '176,bad', '9007199254740992', '176,']) {
    assert.throws(() => parsePresetNumbers(value), /无效/);
  }
});

test('empty selection does no API work', async () => {
  const { execute, state } = fixture();
  const result = await execute({ selection: '' });
  assert.deepEqual(result.rows, []);
  assert.deepEqual(state.calls, []);
  assert.match(renderSummary(result), /没有创建 Issue/);
});

test('validate the full selection before any writes; reject PRs, bots, unlabelled and manual issues', async () => {
  for (const overrides of [
    { pull_request: {} }, { user: bot }, { user: { login: 'custom[bot]', type: 'User' } },
    { labels: [] }, { labels: ['factory:preset', 'factory:manual'] }, { user: null },
  ]) {
    const { execute, state } = fixture([preset(176), preset(155, overrides)]);
    await assert.rejects(execute({ selection: '176,155' }), /人工案例/);
    assert.equal(writes(state).length, 0);
  }
  const { execute, state } = fixture();
  await assert.rejects(execute({ selection: '176,999' }), /not found/);
  assert.equal(writes(state).length, 0);
});

test('dry run accepts closed presets, lists plans and performs only reads', async () => {
  const { execute, state } = fixture();
  const result = await execute({ selection: '176,155', dryRun: true });
  assert.deepEqual(result.rows.map((row) => row.status), ['planned', 'planned']);
  assert.equal(writes(state).length, 0);
  assert.match(renderSummary(result), /只预览/);
});

test('create independent selection-form Issues; explicitly dispatch default-branch builds without inheriting labels or code', async () => {
  const { execute, state } = fixture();
  const result = await execute({ selection: '176,155,176' });
  assert.deepEqual(result.rows.map((row) => row.status), ['dispatched', 'dispatched']);
  assert.equal(state.tasks.length, 2);
  assert.match(state.tasks[0].body, /### 预置案例\n\n#176\n/);
  assert.deepEqual(state.tasks[0].labels, ['factory:test-preset-176', 'agent:pending']);
  assert.equal(dispatches(state).length, 2);
  assert.deepEqual(dispatches(state)[0].body, { ref: 'develop', inputs: { issue_number: '1000' } });
  assert.match(state.comments.get(1000)[0].body, /factory-preset-test-dispatched:900:176/);
  assert.match(renderSummary(result), /最终验收结果/);
});

test('same launcher rerun does not recreate or redispatch after preset prepare rewrites the body', async () => {
  const { execute, state } = fixture();
  await execute();
  state.tasks[0].body = '<!-- factory-preset-ready:hash -->\n正常业务正文';
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
    state.tasks.push({ number: 88, body: '', state: 'open', labels: ['factory:test-preset-176', label] });
    const result = await execute();
    assert.equal(result.rows[0].status, 'skipped-active');
    assert.equal(result.rows[0].issue, 88);
    assert.equal(writes(state).length, 0);
  }
  for (const [label, issueState] of [['agent:review', 'open'], ['agent:failed', 'open'], ['agent:running', 'closed']]) {
    const { execute, state } = fixture();
    state.tasks.push({ number: 88, body: '', state: issueState, labels: ['factory:test-preset-176', label] });
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

test('one dispatch failure preserves results and does not suppress other validated presets', async () => {
  const { execute, state } = fixture();
  state.fail = (method, route, options) => route.endsWith('/dispatches') && options.body.inputs.issue_number === '1000';
  const result = await execute({ selection: '176,155' });
  assert.deepEqual(result.rows.map((row) => row.status), ['error', 'dispatched']);
  assert.match(renderSummary(result), /Injected API failure/);
});

test('pagination reaches an active task beyond the first 100 results', async () => {
  const { execute, state } = fixture();
  state.tasks = Array.from({ length: 101 }, (_, index) => ({
    number: index + 1, body: '', state: 'open',
    labels: ['factory:test-preset-176', index === 100 ? 'agent:running' : 'agent:review'],
  }));
  const result = await execute();
  assert.equal(result.rows[0].status, 'skipped-active');
  assert.equal(result.rows[0].issue, 101);
});

test('summary escapes table and HTML content', () => {
  const summary = renderSummary({ branch: 'develop', rows: [
    { preset: 176, title: '<img> |\nname', status: 'error', issue: 1000, message: '<details> | failure' },
  ] });
  assert.ok(!summary.includes('<img>'));
  assert.match(summary, /&#124;/);
});

test('workflow keeps scheduled selection opt-in, manual preview safe and token permissions explicit', () => {
  const workflow = readFileSync(new URL('../../workflows/scheduled-preset-tests.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron: '17 3 \* \* \*'/);
  assert.match(workflow, /vars\.FACTORY_PRESET_TEST_ISSUES != ''/);
  assert.match(workflow, /default: true\s+type: boolean/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github.token \}\}/);
  assert.match(workflow, /github.event_name == 'workflow_dispatch' && inputs.dry_run/);
  assert.doesNotMatch(workflow, /secrets\.(?:PAT|GH_TOKEN)/);
});

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  archiveDay,
  feishuConfig,
  feishuDigest,
  notifyPending,
  ownersOf,
  parseOwners,
  unknownOwnerKeys,
  sendFeishu,
} from '../daily-findings.mjs';
import { ruleFeaturePaths } from '../problem-classification.mjs';
import {
  clusterOccurrences,
  collectOccurrences,
  renderFindingsIndex,
} from '../../reports/findings-index.mjs';
import {
  LEDGER,
  dayFile,
  dayOf,
  planDailyArchive,
  previousDay,
  renderDailyIndex,
  renderDailyPage,
} from '../../reports/findings-daily.mjs';

const repository = 'owner/factory';
const reports = path.resolve(import.meta.dirname, '../../reports');
const fixture = (name) =>
  JSON.parse(readFileSync(path.join(reports, name), 'utf8'));
// One framework finding (F2) per report, plus any the edit adds.
function report(issue, endedAt, edit = () => {}) {
  const facts = fixture('example.facts.json');
  facts.meta = {
    ...facts.meta,
    repository,
    issue,
    runId: String(9000 + issue),
    attempt: 1,
    snapshotDate: endedAt,
  };
  facts.buildReview = fixture('example.framework-review.json');
  edit(facts.buildReview.evaluation.findings);
  return { delivery: facts };
}
const extra = (id, title) => (findings) =>
  findings.push({ ...findings[1], id, title });
const rules = {
  version: 1,
  generic: [],
  rules: [
    {
      featurePoint: '应用搭建/路由',
      subjects: ['pkg:@nocobase/example-router'],
    },
    { featurePoint: '应用搭建/指引', subjects: ['skill:*'] },
  ],
};
const featureOf = (keys) => ruleFeaturePaths(keys, rules);
const occurrencesOf = (items) => collectOccurrences(items).occurrences;

// gh-pages with content-addressed trees, as commitFindings expects of GitHub.
function pages(items) {
  const digest = (value) =>
    createHash('sha1').update(JSON.stringify(value)).digest('hex');
  const trees = new Map(),
    commits = new Map(),
    blobs = new Map();
  const files = new Map([
    [
      'reports/manifest.json',
      JSON.stringify({
        version: 1,
        issues: Object.fromEntries(
          items.map(({ delivery: { meta } }) => [
            String(meta.issue),
            {
              version: 1,
              repository,
              issue: meta.issue,
              runId: Number(meta.runId),
              attempt: 1,
              start: Date.parse(meta.snapshotDate) - 3_600_000,
              reportId: `${repository}:${meta.issue}`,
              path: `reports/issues/${meta.issue}/runs/${meta.runId}/attempt-1/index.html`,
            },
          ]),
        ),
      }),
    ],
    ...items.map((item) => [
      `reports/issues/${item.delivery.meta.issue}/runs/${item.delivery.meta.runId}/attempt-1/report.json`,
      JSON.stringify(item),
    ]),
  ]);
  const treeSha = digest([...files].sort());
  trees.set(treeSha, files);
  let head = digest(['root']);
  commits.set(head, treeSha);
  const client = {
    repository,
    conflictOnce: false,
    commits: 0,
    async getRef() {
      return { object: { sha: head } };
    },
    async request(method, route, { body, query } = {}) {
      if (method === 'GET' && route.startsWith('/contents/')) {
        const ref = query.ref === 'gh-pages' ? head : query.ref;
        const value = trees
          .get(commits.get(ref))
          ?.get(route.slice('/contents/'.length));
        return value === undefined
          ? null
          : {
              encoding: 'base64',
              content: Buffer.from(value).toString('base64'),
            };
      }
      if (method === 'GET' && route.startsWith('/git/commits/'))
        return { tree: { sha: commits.get(route.split('/').at(-1)) } };
      if (method === 'POST' && route === '/git/blobs') {
        const sha = digest(body.content);
        blobs.set(sha, body.content);
        return { sha };
      }
      if (method === 'POST' && route === '/git/trees') {
        const tree = new Map(trees.get(body.base_tree));
        for (const entry of body.tree)
          tree.set(entry.path, blobs.get(entry.sha));
        const sha = digest([...tree].sort());
        trees.set(sha, tree);
        return { sha };
      }
      if (method === 'POST' && route === '/git/commits') {
        const sha = digest(body);
        commits.set(sha, body.tree);
        return { sha };
      }
      if (method === 'PATCH' && route === '/git/refs/heads/gh-pages') {
        assert.equal(body.force, false);
        if (client.conflictOnce) {
          client.conflictOnce = false;
          throw new Error('422 concurrent ref update');
        }
        client.commits += 1;
        head = body.sha;
        return {};
      }
      throw new Error(`Unexpected ${method} ${route}`);
    },
    file: (name) => trees.get(commits.get(head)).get(name),
    json: (name) => JSON.parse(client.file(name)),
  };
  return client;
}

test('days follow Asia/Shanghai, so a run ending at 00:30 local time belongs to that day', () => {
  assert.equal(dayOf('2026-09-27T16:30:00.000Z'), '2026-09-28');
  assert.equal(dayOf('2026-09-27T15:59:59.000Z'), '2026-09-27');
  assert.equal(previousDay(new Date('2026-09-28T01:07:00Z')), '2026-09-27');
});

test('the first archive rebuilds history by run day and queues only the closed day', () => {
  const plan = planDailyArchive({
    occurrences: occurrencesOf([
      report(101, '2026-09-20T02:00:00.000Z'),
      report(102, '2026-09-27T02:00:00.000Z'),
      report(103, '2026-09-28T02:00:00.000Z'),
    ]),
    day: '2026-09-27',
    now: new Date('2026-09-28T01:07:00Z'),
    featureOf,
  });
  assert.deepEqual(
    plan.added.map(({ date, entries }) => [date, entries.map((e) => e.issue)]),
    [
      ['2026-09-20', [101]],
      ['2026-09-27', [102]],
    ],
  );
  assert.deepEqual(
    plan.ledger.pending.map((item) => item.date),
    ['2026-09-27'],
  );
  assert.equal(plan.ledger.closedThrough, '2026-09-27');
  assert.equal(plan.ledger.keys.length, 2);
});

test('later closes file every unarchived finding under the closed day and never twice', () => {
  const first = planDailyArchive({
    occurrences: occurrencesOf([report(101, '2026-09-26T02:00:00.000Z')]),
    day: '2026-09-26',
    now: new Date('2026-09-27T01:07:00Z'),
    featureOf,
  });
  const occurrences = occurrencesOf([
    report(101, '2026-09-26T02:00:00.000Z'),
    // A replayed review of an old run publishes a rewritten finding.
    report(102, '2026-09-20T02:00:00.000Z', (findings) => {
      findings[1].title = '重新评审后的新问题';
    }),
    report(103, '2026-09-27T09:00:00.000Z'),
  ]);
  const second = planDailyArchive({
    occurrences,
    ledger: first.ledger,
    day: '2026-09-27',
    now: new Date('2026-09-28T01:07:00Z'),
    featureOf,
  });
  assert.deepEqual(
    second.added.map(({ date, entries }) => [
      date,
      entries.map((e) => [e.issue, e.runDay]),
    ]),
    [
      [
        '2026-09-27',
        [
          [102, '2026-09-20'],
          [103, '2026-09-27'],
        ],
      ],
    ],
  );
  const day = second.ledger.days.find((item) => item.date === '2026-09-27');
  assert.equal(day.count, 2);
  assert.equal(day.late, 1);
  assert.equal(second.ledger.pending.length, 3);
  // Closing the same day again, say after its digest was sent, adds nothing: a
  // finding that appeared since waits for the next day as a late entry.
  const arrived = [
    ...occurrences,
    ...occurrencesOf([report(104, '2026-09-27T15:50:00.000Z')]),
  ];
  const again = planDailyArchive({
    occurrences: arrived,
    ledger: second.ledger,
    day: '2026-09-27',
    now: new Date('2026-09-28T02:00:00Z'),
    featureOf,
  });
  assert.equal(again.added.length, 0);
  assert.deepEqual(again.ledger, second.ledger);
  const next = planDailyArchive({
    occurrences: arrived,
    ledger: again.ledger,
    day: '2026-09-28',
    now: new Date('2026-09-29T01:07:00Z'),
    featureOf,
  });
  assert.deepEqual(
    next.added.map(({ date, entries }) => [
      date,
      entries.map((e) => [e.issue, e.runDay]),
    ]),
    [['2026-09-28', [[104, '2026-09-27']]]],
  );
  assert.throws(
    () =>
      planDailyArchive({
        occurrences,
        ledger: second.ledger,
        day: '2026-09-26',
        featureOf,
      }),
    /already closed/,
  );
  // Today has not ended, so it cannot be closed, even before 04:17.
  for (const day of ['2026-09-28', '2026-09-29'])
    assert.throws(
      () =>
        planDailyArchive({
          occurrences,
          ledger: second.ledger,
          day,
          now: new Date('2026-09-27T18:00:00Z'),
          featureOf,
        }),
      /not ended/,
    );
});

test('a skipped day is filled in from each run end date and queued with the closed day', () => {
  const first = planDailyArchive({
    occurrences: occurrencesOf([report(101, '2026-09-25T02:00:00.000Z')]),
    day: '2026-09-25',
    now: new Date('2026-09-26T01:07:00Z'),
    featureOf,
  });
  // The run that should have closed 2026-09-26 never happened.
  const plan = planDailyArchive({
    occurrences: occurrencesOf([
      report(101, '2026-09-25T02:00:00.000Z'),
      report(102, '2026-09-26T02:00:00.000Z'),
      report(103, '2026-09-27T02:00:00.000Z'),
      // Published after its day was closed: late, so it joins the closed day.
      report(104, '2026-09-24T02:00:00.000Z'),
    ]),
    ledger: first.ledger,
    day: '2026-09-27',
    now: new Date('2026-09-28T01:07:00Z'),
    featureOf,
  });
  assert.deepEqual(
    plan.added.map(({ date, entries }) => [
      date,
      entries.map((e) => e.issue).sort(),
    ]),
    [
      ['2026-09-26', [102]],
      ['2026-09-27', [103, 104]],
    ],
  );
  assert.deepEqual(
    plan.ledger.days.map((day) => [day.date, day.count, day.late]),
    [
      ['2026-09-27', 2, 1],
      ['2026-09-26', 1, 0],
      ['2026-09-25', 1, 0],
    ],
  );
  assert.deepEqual(
    [...new Set(plan.ledger.pending.map((item) => item.date))],
    ['2026-09-25', '2026-09-26', '2026-09-27'],
  );
});

test('archiving without notification queues nothing, and a week-old unsent digest is dropped', () => {
  const quiet = planDailyArchive({
    occurrences: occurrencesOf([report(101, '2026-09-20T02:00:00.000Z')]),
    day: '2026-09-20',
    now: new Date('2026-09-21T01:07:00Z'),
    notify: false,
    featureOf,
  });
  assert.equal(quiet.ledger.pending.length, 0);
  const ledger = {
    ...quiet.ledger,
    pending: [{ date: '2026-09-20', key: quiet.ledger.keys[0] }],
  };
  const later = planDailyArchive({
    occurrences: [],
    ledger,
    day: '2026-09-27',
    now: new Date('2026-09-28T01:07:00Z'),
    featureOf,
  });
  assert.equal(later.dropped, 1);
  assert.equal(later.ledger.pending.length, 0);
});

test('subject rules place a finding only when every specific subject agrees', () => {
  const generic = { ...rules, generic: ['skill:nocobase-app-development'] };
  assert.deepEqual(
    ruleFeaturePaths(
      ['pkg:@nocobase/example-router', 'skill:nocobase-app-development'],
      generic,
    ),
    { featurePoint: '应用搭建/路由', candidates: ['应用搭建/路由'] },
  );
  assert.deepEqual(
    ruleFeaturePaths(['pkg:@nocobase/example-router', 'skill:x'], rules),
    { featurePoint: null, candidates: ['应用搭建/指引', '应用搭建/路由'] },
  );
  assert.deepEqual(
    ruleFeaturePaths(['pkg:@nocobase/unknown', 'skill:x'], rules),
    { featurePoint: null, candidates: ['应用搭建/指引'] },
  );
  assert.deepEqual(ruleFeaturePaths([], rules), {
    featurePoint: null,
    candidates: [],
  });
});

const owners = parseOwners(
  JSON.stringify({
    featurePoints: { '应用搭建/路由': ['ou_router'], 应用搭建: ['ou_build'] },
    default: ['ou_lead'],
  }),
);
function entriesOf(items, day = '2026-09-27') {
  const plan = planDailyArchive({
    occurrences: occurrencesOf(items),
    day,
    now: new Date('2026-09-28T01:07:00Z'),
    featureOf,
  });
  return plan.added.find((item) => item.date === day).entries;
}
const nodes = (message) => message.content.post.zh_cn.content.flat();

test('the digest mentions feature point owners, falls back by dimension, and routes unplaced findings', () => {
  const entries = entriesOf([report(101, '2026-09-27T02:00:00.000Z')]);
  entries.push(
    {
      ...entries[0],
      key: 'b'.repeat(24),
      featurePoint: '应用搭建/指引',
      candidates: ['应用搭建/指引'],
    },
    { ...entries[0], key: 'c'.repeat(24), featurePoint: null, candidates: [] },
  );
  assert.equal(entries[0].featurePoint, null);
  assert.deepEqual(entries[0].candidates, ['应用搭建/指引', '应用搭建/路由']);
  const message = feishuDigest({
    date: '2026-09-27',
    entries,
    owners,
    pageUrl:
      'https://owner.github.io/factory/reports/findings/daily/2026-09-27.html',
    reportUrl: (href) => `https://owner.github.io/factory/${href}`,
  });
  const lines = message.content.post.zh_cn.content.map((line) =>
    line
      .map((node) =>
        node.tag === 'at'
          ? `@${node.user_id}`
          : node.tag === 'a'
            ? `[${node.text}]`
            : node.text,
      )
      .join(''),
  );
  assert.match(
    lines[0],
    /^新增 3 条框架发现（轻微 3），来自 1 个任务。\[查看当日归档\]$/,
  );
  assert.ok(lines.includes('【应用搭建/指引】1 条 @ou_build'));
  assert.ok(lines.includes('【未归入功能点】2 条 @ou_lead'));
  // The mixed finding reaches both related owners on its own line.
  assert.ok(
    lines.some((line) =>
      /涉及 应用搭建\/指引、应用搭建\/路由 @ou_build@ou_router$/.test(line),
    ),
  );
  assert.ok(
    nodes(message).some(
      (node) =>
        node.tag === 'a' &&
        node.href ===
          'https://owner.github.io/factory/reports/issues/101/runs/9101/attempt-1/index.html#review-finding-F2',
    ),
  );
  assert.deepEqual(ownersOf(owners, '其他/功能'), ['ou_lead']);
});

test('finding text cannot inject a mention and a long digest stays under the size cap', () => {
  const entries = entriesOf([
    report(101, '2026-09-27T02:00:00.000Z', (findings) => {
      findings[1].title = '<at user_id="all">所有人</at> 标题';
      for (let i = 0; i < 40; i++)
        extra(`F${10 + i}`, `问题 ${i} ${'很长的说明'.repeat(20)}`)(findings);
    }),
  ]);
  const message = feishuDigest({
    date: '2026-09-27',
    entries,
    owners: parseOwners(''),
    pageUrl:
      'https://owner.github.io/factory/reports/findings/daily/2026-09-27.html',
    reportUrl: (href) => `https://owner.github.io/factory/${href}`,
    maxBytes: 6000,
  });
  assert.ok(Buffer.byteLength(JSON.stringify(message)) <= 6000);
  assert.equal(nodes(message).filter((node) => node.tag === 'at').length, 0);
  assert.ok(
    nodes(message).some((node) => /^· 另有 \d+ 条，见$/.test(node.text ?? '')),
  );
});

test('owners and webhook configuration are validated without echoing their values', () => {
  assert.equal(feishuConfig({}), null);
  assert.throws(
    () =>
      feishuConfig({
        FEISHU_WEBHOOK_URL: 'https://example.com/open-apis/bot/v2/hook/x',
      }),
    /Feishu or Lark custom bot webhook/,
  );
  assert.throws(
    () =>
      feishuConfig({
        FEISHU_WEBHOOK_URL: 'http://open.feishu.cn/open-apis/bot/v2/hook/x',
      }),
    /custom bot webhook/,
  );
  assert.throws(
    () => parseOwners('{"default": ["ou_secret", "not valid"]}'),
    (error) =>
      /invalid mentions for default/.test(error.message) &&
      !error.message.includes('ou_secret'),
  );
  assert.throws(
    () => parseOwners('{"default": ["ou_secret"'),
    (error) =>
      /not valid JSON/.test(error.message) &&
      !error.message.includes('ou_secret'),
  );
  assert.throws(
    () => parseOwners('{"defaults": ["ou_a"]}'),
    /unknown keys defaults/,
  );
  assert.deepEqual(
    unknownOwnerKeys(
      parseOwners(
        '{"featurePoints":{"应用搭建/路由":["ou_a"],"应用搭建":["ou_b"],"应用搭建/路游":["ou_c"]}}',
      ),
      rules,
    ),
    ['应用搭建/路游'],
  );
  const config = feishuConfig({
    FEISHU_WEBHOOK_URL: 'https://open.feishu.cn/open-apis/bot/v2/hook/abc',
    FEISHU_WEBHOOK_SECRET: 'sec',
    FEISHU_PROBLEM_OWNERS:
      '{"featurePoints":{"应用搭建/路由":["ou_a","ou_a"]}}',
  });
  assert.deepEqual(config.owners, {
    featurePoints: { '应用搭建/路由': ['ou_a'] },
    default: [],
  });
});

test('messages are signed, retried on server errors and never leak the webhook URL', async () => {
  const config = {
    url: 'https://open.feishu.cn/open-apis/bot/v2/hook/token-in-url',
    secret: 'sec',
    owners: parseOwners(''),
  };
  const calls = [];
  const reply = (status, body) => ({
    ok: status < 300,
    status,
    json: async () => body,
  });
  const responses = [reply(502, null), reply(200, { code: 0, msg: 'success' })];
  await sendFeishu(
    config,
    { msg_type: 'post', content: {} },
    {
      fetcher: async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return responses.shift();
      },
      now: () => 1_790_000_000_000,
      pause: async () => {},
    },
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.timestamp, '1790000000');
  assert.equal(
    calls[1].body.sign,
    createHmac('sha256', '1790000000\nsec').update('').digest('base64'),
  );
  assert.equal(calls[1].body.msg_type, 'post');
  let attempts = 0;
  await assert.rejects(
    sendFeishu(
      config,
      { msg_type: 'post' },
      {
        fetcher: async () => {
          attempts += 1;
          return reply(200, { code: 19021, msg: 'sign match fail' });
        },
        pause: async () => {},
      },
    ),
    (error) =>
      /code 19021: sign match fail/.test(error.message) &&
      !error.message.includes('token-in-url'),
  );
  assert.equal(attempts, 1);
  await assert.rejects(
    sendFeishu(
      config,
      { msg_type: 'post' },
      {
        fetcher: async (url) => {
          throw new TypeError(`fetch failed ${url}`);
        },
        pause: async () => {},
      },
    ),
    (error) => !error.message.includes('token-in-url'),
  );
});

test('a scheduled close archives to gh-pages, sends the digest once and forgets it', async () => {
  const client = pages([
    report(101, '2026-09-26T02:00:00.000Z'),
    report(102, '2026-09-27T02:00:00.000Z', extra('F9', '另一个问题')),
    report(103, '2026-09-28T00:30:00.000Z'),
  ]);
  client.conflictOnce = true;
  const now = new Date('2026-09-28T01:07:00Z');
  const archived = await archiveDay(client, { now, rules });
  assert.match(
    client.file('reports/findings/daily/index.html'),
    /已归档 3 条 · 待归档 1 条/,
  );
  assert.deepEqual(
    {
      day: archived.day,
      added: archived.added,
      pending: archived.pending,
      changed: archived.changed,
    },
    { day: '2026-09-27', added: 3, pending: 2, changed: true },
  );
  assert.deepEqual(
    client.json(dayFile('2026-09-27')).entries.map((entry) => entry.id),
    ['102:9102:1:F2', '102:9102:1:F9'],
  );
  assert.ok(client.file(dayFile('2026-09-26')));
  assert.match(
    client.file('reports/findings/daily/2026-09-27.html'),
    /2026-09-27 新发现的框架问题/,
  );
  assert.match(
    client.file('reports/findings/daily/index.html'),
    /href="2026-09-27.html"/,
  );
  // The public archive never carries owners.
  assert.doesNotMatch(
    client.file(LEDGER) + client.file(dayFile('2026-09-27')),
    /ou_/,
  );

  const sent = [];
  const config = {
    url: 'https://open.feishu.cn/open-apis/bot/v2/hook/x',
    secret: null,
    owners,
  };
  const send = async (_config, message) => sent.push(message);
  const result = await notifyPending(client, config, {
    baseUrl: 'https://owner.github.io/factory/',
    send,
  });
  assert.deepEqual(result, {
    sent: [{ date: '2026-09-27', count: 2 }],
    failed: [],
    remaining: 0,
  });
  assert.equal(sent.length, 1);
  assert.equal(
    sent[0].content.post.zh_cn.title,
    'NocoBase3 框架问题日报 · 2026-09-27',
  );
  assert.deepEqual(client.json(LEDGER).pending, []);

  const commits = client.commits;
  assert.equal((await archiveDay(client, { now, rules })).changed, false);
  assert.deepEqual(
    await notifyPending(client, config, {
      baseUrl: 'https://owner.github.io/factory/',
      send,
    }),
    {
      sent: [],
      failed: [],
      remaining: 0,
    },
  );
  assert.equal(client.commits, commits);
  assert.equal(sent.length, 1);
});

test('a failed send keeps the day pending for the next run', async () => {
  const client = pages([report(102, '2026-09-27T02:00:00.000Z')]);
  await archiveDay(client, { now: new Date('2026-09-28T01:07:00Z'), rules });
  const config = {
    url: 'https://open.feishu.cn/open-apis/bot/v2/hook/x',
    secret: null,
    owners,
  };
  const failed = await notifyPending(client, config, {
    baseUrl: 'https://owner.github.io/factory/',
    send: async () => {
      throw new Error(
        'Feishu rejected the digest (HTTP 200, code 11232: frequency limited)',
      );
    },
  });
  assert.equal(failed.failed.length, 1);
  assert.equal(failed.remaining, 1);
  assert.equal(client.json(LEDGER).pending.length, 1);
  assert.equal((await notifyPending(client, null, {})).remaining, 1);
});

test('day and index pages escape finding text and link each report', async () => {
  const entries = entriesOf([
    report(101, '2026-09-27T02:00:00.000Z', (findings) => {
      findings[1].title = '<script>alert(1)</script>';
    }),
  ]);
  const html = await renderDailyPage({
    version: 1,
    date: '2026-09-27',
    entries,
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(
    html,
    /href="\.\.\/\.\.\/issues\/101\/runs\/9101\/attempt-1\/index\.html#review-finding-F2"/,
  );
  assert.match(html, /涉及 应用搭建\/指引、应用搭建\/路由/);
  const index = await renderDailyIndex({
    closedThrough: '2026-09-27',
    startedAt: '2026-09-20T01:07:00.000Z',
    days: [
      { date: '2026-09-27', count: 1, severities: { minor: 1 }, late: 0 },
      { date: '2026-09-26', count: 0, severities: {}, late: 0 },
    ],
  });
  assert.match(index, /href="2026-09-27.html"/);
  assert.doesNotMatch(index, /2026-09-26.html/);
});

test('daily preview shows current and late findings without mutating closed days', async () => {
  const archived = report(101, '2026-09-27T02:00:00.000Z');
  const plan = planDailyArchive({
    occurrences: occurrencesOf([archived]),
    day: '2026-09-27',
    now: new Date('2026-09-28T01:07:00Z'),
    notify: false,
  });
  const before = JSON.stringify(plan.ledger);
  const occurrences = occurrencesOf([
    archived,
    report(102, '2026-09-27T03:00:00.000Z'),
    report(103, '2026-09-27T16:30:00.000Z', (findings) => {
      findings[1].title = '<script>unsafe</script>';
    }),
  ]);
  const html = await renderDailyIndex(plan.ledger, {
    occurrences: [...occurrences, ...occurrences],
  });
  assert.match(html, /已归档 1 条 · 待归档 2 条/);
  assert.match(html, /2026-09-28 · 1 条 · 待归档/);
  assert.match(html, /2026-09-27 · 1 条 · 将补录到后续归档日/);
  assert.match(html, /04:17/);
  assert.match(html, /&lt;script&gt;unsafe/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /issues\/101\/runs/);
  assert.match(
    html,
    /issues\/103\/runs\/9103\/attempt-1\/index.html#review-finding-F2/,
  );
  assert.equal(JSON.stringify(plan.ledger), before);
});

test('daily preview exists before the first archive and explains empty states', async () => {
  const html = await renderDailyIndex(null, {
    occurrences: occurrencesOf([report(101, '2026-09-28T02:00:00.000Z')]),
  });
  assert.match(html, /尚未完成首次日归档/);
  assert.match(html, /已归档 0 条 · 待归档 1 条/);
  assert.match(html, /首次日归档会补建历史日期/);
  const empty = await renderDailyIndex(null);
  assert.match(empty, /没有待归档发现/);
});

test('occurrences carry the stable subjects their own evidence cites', async () => {
  const [occurrence] = occurrencesOf([report(101, '2026-09-27T02:00:00.000Z')]);
  assert.deepEqual(occurrence.subjectKeys, [
    'pkg:@nocobase/example-router',
    'skill:example-router',
  ]);
  assert.equal(occurrence.endedAt, '2026-09-27T02:00:00.000Z');
  assert.equal(clusterOccurrences([occurrence]).length, 1);
  assert.match(
    await renderFindingsIndex([report(101, '2026-09-27T02:00:00.000Z')]),
    /href="daily\/">按日期归档/,
  );
});

test('the workflow gives Feishu credentials only to the send step', () => {
  const workflow = readFileSync(
    path.resolve(import.meta.dirname, '../../workflows/daily-findings.yml'),
    'utf8',
  )
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
  assert.match(workflow, /^permissions: \{\}$/m);
  // 04:17 Asia/Shanghai.
  assert.match(workflow, /cron: '17 20 \* \* \*'/);
  assert.match(workflow, /group: factory-task-usage/);
  const [before, send] = workflow.split(
    '- name: Send pending digests to Feishu',
  );
  // The Pages base URL comes from the read-only configure-pages step, which
  // runs even when nothing changed, so a re-sent digest links to the site
  // rather than to the guessed default; the deploy stays conditional. A
  // transient failure of it falls back to the default instead of skipping
  // the digest, which still waits for a deployment when the archive changed.
  assert.match(
    before,
    /- uses: actions\/configure-pages@[0-9a-f]{40} # v\d[^\n]*\n {8}id: pages\n {8}continue-on-error: true\n {6}- uses: actions\/upload-pages-artifact/,
  );
  assert.match(
    send,
    /!cancelled\(\) && steps\.archive\.outcome == 'success' &&\n\s+\(steps\.archive\.outputs\.changed != 'true' \|\| steps\.deployment\.outcome == 'success'\)/,
  );
  for (const action of ['upload-pages-artifact', 'deploy-pages'])
    assert.match(
      before,
      new RegExp(
        `- uses: actions/${action}@[0-9a-f]{40} # v\\d[^\\n]*\\n {8}if: steps\\.archive\\.outputs\\.changed == 'true'`,
      ),
      action,
    );
  assert.match(
    send,
    /REPORT_BASE_URL: \$\{\{ steps\.pages\.outputs\.base_url \}\}/,
  );
  assert.doesNotMatch(send, /steps\.deployment\.outputs\.page_url/);
  assert.doesNotMatch(before, /FEISHU_WEBHOOK_SECRET|FEISHU_PROBLEM_OWNERS/);
  // The archive step only learns whether a webhook exists.
  assert.deepEqual(before.match(/secrets\.[A-Z_]+[^\n]*/g), [
    "secrets.FEISHU_WEBHOOK_URL != '' }}",
  ]);
  assert.match(
    send,
    /FEISHU_WEBHOOK_URL: \$\{\{ secrets\.FEISHU_WEBHOOK_URL \}\}/,
  );
  // Nothing is queued or sent until the digest is explicitly switched on.
  assert.match(
    before,
    /DAILY_NOTIFY: \$\{\{ vars\.FACTORY_FEISHU_DIGEST == 'true' && /,
  );
  assert.match(
    send,
    /^\s+if: >-\n(?:\s+[^\n]*&&\n)*\s+vars\.FACTORY_FEISHU_DIGEST == 'true' && /,
  );
  assert.match(
    send,
    /FEISHU_WEBHOOK_SECRET: \$\{\{ secrets\.FEISHU_WEBHOOK_SECRET \}\}/,
  );
  // The runner prints each step's env in the public log and masks only secrets.
  assert.match(
    send,
    /FEISHU_PROBLEM_OWNERS: \$\{\{ secrets\.FEISHU_PROBLEM_OWNERS \}\}/,
  );
  assert.doesNotMatch(workflow, /vars\.FEISHU_/);
});

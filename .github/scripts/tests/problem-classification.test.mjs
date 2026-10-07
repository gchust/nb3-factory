import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeZip } from '../evaluation-bundle.mjs';
import { problemSubmission } from '../problem-submission.mjs';
import {
  classificationInputs,
  featureIndex,
  fetchTaxonomy,
  loadRules,
  prepareProblemClassification,
  ruleClassify,
  runModelClassification,
  validateDecisions,
  validateTaxonomy,
  fetchTaskProblems,
  validateDuplicates,
} from '../problem-classification.mjs';
import {
  classificationsByItem,
  duplicatesByItem,
  reportLinkSubmission,
} from '../report-link-submission.mjs';

// The TestManage3 feature point tree as deployed on 2026-09-28.
const tree = {
  应用安装: [34, ['从 create app 开始，支持不同数据库', '什么时候 Agent 介入']],
  应用部署: [35, ['build', 'deploy', '回滚', '启动、重启、停止等']],
  应用升级: [36, ['代码更新', '多环境迁移']],
  应用搭建: [
    37,
    [
      '数据库',
      '认证',
      '授权',
      '文件',
      'AI 员工',
      '知识库',
      '邮件',
      '多语言',
      '日志',
      '工作流',
      '通知',
      '队列',
      '定时任务',
      '审计',
      '导入导出',
      '审批',
      '历史记录',
      '备份',
    ],
  ],
  应用测试: [38, ['测试 kit', '如何写测试']],
};
function taxonomyFor(omit = []) {
  const featurePoints = [];
  let next = 39;
  for (const [dimension, [id, features]] of Object.entries(tree)) {
    featurePoints.push({
      id,
      name: dimension,
      level: 'dimension',
      parentId: null,
    });
    for (const name of features) {
      const featureId = next++;
      if (!omit.includes(`${dimension}/${name}`))
        featurePoints.push({
          id: featureId,
          name,
          level: 'feature',
          parentId: id,
        });
    }
  }
  return validateTaxonomy({ version: 1, featurePoints });
}
const index = featureIndex(taxonomyFor());
const id = (place) => index.byPath.get(place);
const rules = loadRules();
const input = (subjectKeys, owners = ['documentation']) => ({
  key: 'k',
  title: 't',
  description: 'd',
  subjectKeys,
  owners,
  kinds: ['issue'],
  modules: [],
  taskTitle: '任务',
});

test('every subject rule names a feature point in the deployed tree', () => {
  assert.equal(id('应用搭建/数据库'), 47);
  assert.equal(id('应用测试/测试 kit'), 65);
  for (const rule of rules.rules)
    assert.ok(index.byPath.has(rule.featurePoint), rule.featurePoint);
  assert.equal(
    new Set(rules.rules.map((rule) => rule.featurePoint)).size,
    rules.rules.length,
  );
});

test('rules place single-feature subjects and leave mixed, generic-only or unknown ones to the model', () => {
  const cases = [
    // Delivered problem subject sets, e.g. TestManage3 #189, #187, #245, #217, #250, #238.
    [
      [
        'pkg:@nocobase/db',
        'pkg:@nocobase/repository-input',
        'guide:@nocobase/db/skills/nocobase-db',
        'skill:nocobase-app-development',
        'guide:app/AGENTS.md',
      ],
      id('应用搭建/数据库'),
    ],
    [
      [
        'pkg:@nocobase/db',
        'pkg:@nocobase/db-sqlite',
        'skill:nocobase-db',
        'skill:nocobase-app-development',
      ],
      id('应用搭建/数据库'),
    ],
    [
      [
        'pkg:@nocobase/authorization',
        'pkg:@nocobase/app-plugin-authz-default-access',
        'skill:nocobase-app-plugin-authz-default-access',
        'guide:@nocobase/app-plugin-authz-sharing-rules/skills/nocobase-app-plugin-authz-sharing-rules',
      ],
      id('应用搭建/授权'),
    ],
    [
      [
        'pkg:@nocobase/app-plugin-workflow',
        'guide:@nocobase/app-plugin-workflow/skills/nocobase-app-plugin-workflow',
        'pkg:@nocobase/service-provider',
      ],
      id('应用搭建/工作流'),
    ],
    [
      [
        'pkg:@nocobase/app-plugin-file',
        'guide:@nocobase/app-plugin-file/skills/nocobase-app-plugin-file',
      ],
      id('应用搭建/文件'),
    ],
    [
      [
        'skill:nocobase-app-plugin-notification',
        'skill:nocobase-app-plugin-notification-in-app',
        'pkg:@nocobase/app-plugin-notification-in-app',
      ],
      id('应用搭建/通知'),
    ],
    [
      [
        'pkg:@nocobase/app-plugin-scheduler',
        'skill:nocobase-app-plugin-scheduler',
      ],
      id('应用搭建/定时任务'),
    ],
    [['pkg:@nocobase/db-testkit'], id('应用测试/测试 kit')],
  ];
  for (const [subjects, expected] of cases) {
    const { decision } = ruleClassify(input(subjects), rules, index);
    assert.equal(decision?.featurePointId, expected, subjects.join());
    assert.equal(decision.method, 'rule');
    assert.match(decision.reason, / → /);
  }
  // #188 db + authentication, #247 file + authentication, #253 authorization + db.
  assert.deepEqual(
    ruleClassify(
      input([
        'pkg:@nocobase/db',
        'pkg:@nocobase/app-server',
        'pkg:@nocobase/app-plugin-authentication',
      ]),
      rules,
      index,
    ),
    {
      candidates: [id('应用搭建/数据库'), id('应用搭建/认证')].sort(
        (a, b) => a - b,
      ),
    },
  );
  assert.equal(
    ruleClassify(
      input([
        'pkg:@nocobase/app-plugin-file',
        'skill:nocobase-app-plugin-authentication',
      ]),
      rules,
      index,
    ).candidates.length,
    2,
  );
  assert.equal(
    ruleClassify(
      input([
        'pkg:@nocobase/authorization',
        'skill:nocobase-app-plugin-authorization',
        'pkg:@nocobase/db',
      ]),
      rules,
      index,
    ).candidates.length,
    2,
  );
  // #232, #241 and #265 only cite general guidance.
  assert.deepEqual(
    ruleClassify(
      input(['skill:nocobase-app-development', 'guide:app/AGENTS.md']),
      rules,
      index,
    ),
    { candidates: [] },
  );
  assert.deepEqual(ruleClassify(input([]), rules, index), { candidates: [] });
  // A subject without a rule keeps a known one from deciding alone.
  assert.deepEqual(
    ruleClassify(
      input(['pkg:@nocobase/db', 'pkg:@nocobase/realtime']),
      rules,
      index,
    ),
    { candidates: [id('应用搭建/数据库')] },
  );
  // A rule whose feature point was removed from the tree does not fire.
  const trimmed = featureIndex(taxonomyFor(['应用搭建/审计']));
  assert.deepEqual(
    ruleClassify(input(['pkg:@nocobase/app-plugin-audit']), rules, trimmed),
    { candidates: [] },
  );
});

// Each subject is one module target with its own evidence; a finding cites the
// evidence of its subjects unless a case says otherwise.
const evidenceOf = (subject) => `review/1/E:${subject}`;
const finding = (localId, subjectKeys, edit = {}) => ({
  id: `review/1/${localId}`,
  title: `问题 ${localId}`,
  kind: 'issue',
  owner: 'documentation',
  reviewerStatus: 'open',
  detail: '触发条件与实际行为',
  impact: '影响',
  suggestedChange: '建议',
  subjectKeys,
  evidence: subjectKeys.map(evidenceOf),
  moduleKeys: ['review/1/M1'],
  ...edit,
});
const documentFor = (runKey, findings, criteria = []) => ({
  type: 'evaluation-report',
  source: { instance: 'owner/repo' },
  run: { key: runKey, task: { title: '客户管理', issue: Number(runKey.split('/')[3]) } },
  reviews: [
    {
      selected: true,
      modules: [
        {
          key: 'review/1/M1',
          name: '数据建模',
          targets: [...new Set(findings.flatMap((f) => f.subjectKeys))].map(
            (subjectKey) => ({
              subjectKey,
              evidence: [evidenceOf(subjectKey)],
            }),
          ),
        },
      ],
      findings,
    },
  ],
  qa: { criteria },
});
// TestManage3 #265: module M5 reviewed server assembly, routes and authentication
// together, so the finding inherited the authentication plugin although its only
// subject evidence was app/AGENTS.md.
const assembly = [
  'pkg:@nocobase/service-provider',
  'pkg:@nocobase/app-server',
  'pkg:@nocobase/app-plugin-authentication',
  'skill:nocobase-app-development',
  'guide:app/AGENTS.md',
];
const formatting = finding('F3', assembly, {
  owner: 'template',
  title: '生成的基线 AGENTS.md 违反自身 Prettier 检查',
  evidence: [evidenceOf('guide:app/AGENTS.md'), 'review/1/E:retro'],
});

test('inputs carry the submitted problem keys with owners and modules', () => {
  const document = documentFor('owner/repo/issues/1/initial', [
    finding('F1', ['pkg:@nocobase/db']),
  ]);
  const [item] = classificationInputs(document);
  assert.equal(item.key, problemSubmission(document).problems[0].key);
  assert.deepEqual(
    [item.owners, item.kinds, item.modules, item.taskTitle],
    [['documentation'], ['issue'], ['数据建模'], '客户管理'],
  );
  const qa = documentFor(
    'owner/repo/issues/2/initial',
    [],
    [{ id: 'B1', text: '切换中英文后逐页检查', finalFull: 'failed' }],
  );
  qa.reviews = [];
  assert.deepEqual(classificationInputs(qa), []);
  assert.deepEqual(classificationInputs({ type: 'evaluation-batch' }), []);
});

test('only the targets a finding cites decide its subjects', () => {
  const document = documentFor('owner/repo/issues/5/initial', [formatting]);
  const [item] = classificationInputs(document);
  // The delivered problem keeps the module subjects its key was built from.
  assert.deepEqual(
    problemSubmission(document).problems[0].subjectKeys,
    [...assembly].sort(),
  );
  assert.deepEqual(item.subjectKeys, ['guide:app/AGENTS.md']);
  assert.deepEqual(ruleClassify(item, rules, index), { candidates: [] });
  const auth = finding('F1', assembly, {
    evidence: [
      evidenceOf('pkg:@nocobase/app-plugin-authentication'),
      evidenceOf('guide:app/AGENTS.md'),
    ],
  });
  const [placed] = classificationInputs(
    documentFor('owner/repo/issues/6/initial', [auth]),
  );
  assert.equal(
    ruleClassify(placed, rules, index).decision.featurePointId,
    id('应用搭建/认证'),
  );
});

test('non-NocoBase3 findings never reach classification', () => {
  const document = documentFor(
    'owner/repo/issues/7/initial',
    ['factory', 'environment', 'application', 'unknown'].map((owner, i) =>
      finding(`F${i + 1}`, ['pkg:@nocobase/db'], { owner }),
    ),
  );
  assert.deepEqual(classificationInputs(document), []);
});

function planFixture(t, documents) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'test-problem-plan-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'bundles'));
  const items = documents.map((document, i) => {
    if (!document)
      return { id: `item-${i}`, type: 'evaluation-report', bundle: null };
    writeFileSync(
      path.join(root, 'bundles', `${i}.zip`),
      writeZip([
        {
          path: 'evaluation.json',
          data: Buffer.from(JSON.stringify(document)),
        },
      ]),
    );
    return {
      id: `item-${i}`,
      type: 'evaluation-report',
      bundle: `bundles/${i}.zip`,
    };
  });
  return { root, plan: { version: 1, targetId: 'target', items } };
}
const mixed = documentFor('owner/repo/issues/3/initial', [
  finding('F1', ['pkg:@nocobase/db', 'skill:nocobase-db']),
  finding('F2', [
    'pkg:@nocobase/db',
    'pkg:@nocobase/app-plugin-authentication',
  ]),
  formatting,
  finding('F4', [], {
    owner: 'template',
    title: 'DatePicker 清空后仍显示旧值',
  }),
  finding('F5', ['pkg:@nocobase/db'], {
    owner: 'factory',
    title: '修复轮次中断',
  }),
]);

test('rule decisions are ready for every item; one pending entry covers repeated revisions', (t) => {
  const { root, plan } = planFixture(t, [mixed, null, mixed]);
  const { classification, pending } = prepareProblemClassification({
    plan,
    planDirectory: root,
    taxonomy: taxonomyFor(),
    rules,
  });
  assert.deepEqual(
    classification.items.map((item) => item.id),
    ['item-0', 'item-2'],
  );
  const decided = Object.values(classification.items[0].problems);
  assert.deepEqual(
    decided.map((value) => value.featurePointId),
    [47],
  );
  assert.equal(pending.problems.length, 3);
  const agentsGuide = pending.problems.find(
    (problem) => problem.title === formatting.title,
  );
  assert.deepEqual(
    [agentsGuide.subjectKeys, agentsGuide.candidates],
    [['guide:app/AGENTS.md'], []],
  );
  assert.ok(
    pending.problems.every(
      (problem) => problem.items.join() === 'item-0,item-2',
    ),
  );
  assert.deepEqual(
    pending.problems.find((problem) => problem.title === '问题 F2').candidates,
    [47, 48],
  );
  assert.equal(pending.features.length, 28);
  assert.equal(classification.taxonomySha256, pending.taxonomySha256);
  classificationsByItem(classification);
});

test('model decisions must cover every pending problem once with a listed feature point', () => {
  const pending = {
    features: [{ id: 47, path: '应用搭建/数据库' }],
    problems: [{ key: 'a'.repeat(64) }, { key: 'b'.repeat(64) }],
  };
  const ok = {
    version: 1,
    decisions: [
      { key: 'a'.repeat(64), featurePointId: 47, reason: ' 数据库迁移 ' },
      {
        key: 'b'.repeat(64),
        featurePointId: null,
        reason: '前端组件，没有对应功能点',
      },
    ],
  };
  assert.deepEqual(
    [...validateDecisions(ok, pending).values()].map((value) => [
      value.featurePointId,
      value.method,
      value.reason,
    ]),
    [
      [47, 'model', '数据库迁移'],
      [null, 'model', '前端组件，没有对应功能点'],
    ],
  );
  const variants = [
    { ...ok, decisions: ok.decisions.slice(0, 1) },
    { ...ok, decisions: [ok.decisions[0], ok.decisions[0]] },
    {
      ...ok,
      decisions: [ok.decisions[0], { ...ok.decisions[1], featurePointId: 37 }],
    },
    {
      ...ok,
      decisions: [ok.decisions[0], { ...ok.decisions[1], key: 'c'.repeat(64) }],
    },
    {
      ...ok,
      decisions: [ok.decisions[0], { ...ok.decisions[1], reason: '  ' }],
    },
    {
      ...ok,
      decisions: [
        ok.decisions[0],
        { ...ok.decisions[1], reason: 'x'.repeat(1001) },
      ],
    },
    { version: 2, decisions: ok.decisions },
  ];
  for (const draft of variants)
    assert.throws(() => validateDecisions(draft, pending));
});

async function modelFixture(t, edit, { documents = [mixed], taskProblems = null } = {}) {
  const { root, plan } = planFixture(t, documents);
  const directory = path.join(root, 'classification');
  const { classification, pending } = prepareProblemClassification({
    plan,
    planDirectory: root,
    taxonomy: taxonomyFor(),
    taskProblems,
    rules,
  });
  mkdirSync(directory);
  writeFileSync(
    path.join(directory, 'classification.json'),
    JSON.stringify(classification),
  );
  writeFileSync(path.join(directory, 'pending.json'), JSON.stringify(pending));
  let workspace,
    calls = 0;
  const adapter = {
    id: 'pi',
    version: '1.0.0',
    credentials: ['CODE_AGENT_API_KEY'],
    parseEvent: () => ({}),
    createInvocation(args) {
      workspace = args.workspace;
      for (const name of ['GITHUB_TOKEN', 'EVALUATION_TOKEN', 'CODEX_API_KEY'])
        assert.equal(args.env[name], undefined, name);
      assert.equal(args.env.FACTORY_AGENT_ROLE, 'review');
      return {
        command: 'unused-fixture',
        args: [],
        cwd: args.workspace,
        env: args.env,
        model: 'fixture',
      };
    },
  };
  const invoke = async (args) => {
    calls++;
    assert.equal(args.invocationTimeoutSeconds, 60);
    const problems = JSON.parse(
      readFileSync(path.join(args.cwd, 'problems.json'), 'utf8'),
    );
    assert.ok(problems.every((problem) => !('items' in problem)));
    const duplicates = JSON.parse(
      readFileSync(path.join(args.cwd, 'duplicates.json'), 'utf8'),
    );
    assert.ok(duplicates.every((problem) => !('items' in problem)));
    const draft = {
      version: 1,
      decisions: problems.map((problem) => ({
        key: problem.key,
        featurePointId: problem.candidates[0] ?? null,
        reason: `依据 fixture-secret ${problem.title}`,
      })),
      // The first problem is judged a duplicate of the task's first problem.
      duplicates: duplicates.map((problem, i) => ({
        key: problem.key,
        problemId: i === 0 ? problem.candidates[0].id : null,
        reason: `判重 fixture-secret ${problem.title}`,
      })),
    };
    args.result.observe({ complete: true }, '{}');
    args.result.save(
      args.log,
      { status: 'completed', exitCode: 0 },
      (value) => value,
    );
    writeFileSync(path.join(args.cwd, 'decisions.json'), JSON.stringify(draft));
    await edit?.({ args, draft });
  };
  const run = () =>
    runModelClassification(directory, {
      adapter,
      invoke,
      env: {
        CODE_AGENT_ENGINE: 'pi',
        FACTORY_PROBLEM_CLASSIFICATION_TIMEOUT_SECONDS: '60',
        CODE_AGENT_API_KEY: 'fixture-secret',
        GITHUB_TOKEN: 'must-not-pass',
        EVALUATION_TOKEN: 'must-not-pass',
        CODEX_API_KEY: 'wrong-engine',
      },
    });
  const read = (file) =>
    JSON.parse(readFileSync(path.join(directory, file), 'utf8'));
  return {
    directory,
    classification,
    run,
    read,
    calls: () => calls,
    workspace: () => workspace,
  };
}

test('the Agent places only what rules left, and its reasons are redacted before sending', async (t) => {
  const fixture = await modelFixture(t);
  const result = await fixture.run();
  assert.equal(result.model.state, 'completed');
  const problems = Object.values(result.items[0].problems);
  assert.equal(problems.length, 4);
  assert.deepEqual(
    problems
      .filter((value) => value.method === 'model')
      .map((value) => value.featurePointId)
      .sort(),
    [47, null, null].sort(),
  );
  assert.doesNotMatch(
    JSON.stringify(fixture.read('classification.json')),
    /fixture-secret/,
  );
  assert.ok(
    existsSync(
      path.join(fixture.directory, 'agent-problems.jsonl.invocation.json'),
    ),
  );
  assert.equal(existsSync(fixture.workspace()), false);
});

for (const mode of ['invalid-output', 'edited-input', 'throw', 'timeout']) {
  test(`Agent ${mode} keeps rule decisions and leaves the rest unclassified`, async (t) => {
    const fixture = await modelFixture(t, ({ args, draft }) => {
      if (mode === 'invalid-output')
        writeFileSync(
          path.join(args.cwd, 'decisions.json'),
          JSON.stringify({ ...draft, decisions: draft.decisions.slice(1) }),
        );
      if (mode === 'edited-input')
        writeFileSync(path.join(args.cwd, 'features.json'), '[]');
      if (mode === 'timeout')
        args.result.save(
          args.log,
          { status: 'timed_out', exitCode: null },
          (value) => value,
        );
      if (mode === 'throw') throw new Error('provider failed fixture-secret');
    });
    await assert.rejects(fixture.run());
    const saved = fixture.read('classification.json');
    assert.equal(saved.model.state, 'failed');
    assert.deepEqual(saved.items, fixture.classification.items);
    assert.doesNotMatch(
      readFileSync(path.join(fixture.directory, 'failure.json'), 'utf8'),
      /fixture-secret/,
    );
    assert.equal(existsSync(fixture.workspace()), false);
  });
}

test('no Agent is invoked when rules decide everything', async (t) => {
  const { root, plan } = planFixture(t, [
    documentFor('owner/repo/issues/4/initial', [
      finding('F1', ['pkg:@nocobase/db']),
    ]),
  ]);
  const { classification, pending } = prepareProblemClassification({
    plan,
    planDirectory: root,
    taxonomy: taxonomyFor(),
    rules,
  });
  assert.equal(pending.problems.length, 0);
  const directory = path.join(root, 'out');
  mkdirSync(directory);
  writeFileSync(
    path.join(directory, 'classification.json'),
    JSON.stringify(classification),
  );
  writeFileSync(path.join(directory, 'pending.json'), JSON.stringify(pending));
  const result = await runModelClassification(directory, {
    env: { CODE_AGENT_ENGINE: 'pi' },
    adapter: {},
    invoke: () => assert.fail('no model call'),
  });
  assert.deepEqual(result, classification);
});

test('the feature point list is read from the receiver beside its import endpoint', async () => {
  const seen = [];
  const body = {
    version: 1,
    featurePoints: [
      {
        id: 37,
        name: '应用搭建',
        level: 'dimension',
        parentId: null,
        remark: 'dropped',
      },
      { id: 47, name: '数据库', level: 'feature', parentId: 37 },
    ],
  };
  const fetcher = async (url, options) => {
    seen.push({ url, options });
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const env = {
    EVALUATION_ENDPOINT: 'https://test3.example/main/api/evaluations/import',
    EVALUATION_TOKEN: 'receiver-key',
  };
  const taxonomy = await fetchTaxonomy(env, { fetcher });
  assert.equal(
    seen[0].url,
    'https://test3.example/main/api/evaluations/feature-points',
  );
  assert.equal(seen[0].options.method, 'GET');
  assert.equal(seen[0].options.redirect, 'manual');
  assert.equal(seen[0].options.headers['x-api-key'], 'receiver-key');
  assert.equal(taxonomy.featurePoints[0].remark, undefined);
  await fetchTaxonomy({ ...env, EVALUATION_AUTH_MODE: 'bearer' }, { fetcher });
  assert.equal(seen[1].options.headers.Authorization, 'Bearer receiver-key');
  await assert.rejects(
    fetchTaxonomy(
      { ...env, EVALUATION_ENDPOINT: 'https://test3.example/main/api/other' },
      { fetcher },
    ),
    /evaluations\/import/,
  );
  await assert.rejects(
    fetchTaxonomy(env, {
      fetcher: async () =>
        new Response('', {
          status: 302,
          headers: { location: 'https://elsewhere.example' },
        }),
    }),
    /302/,
  );
  await assert.rejects(
    fetchTaxonomy(env, {
      fetcher: async () =>
        new Response(
          JSON.stringify({ version: 1, featurePoints: [{ id: 'x' }] }),
          { status: 200 },
        ),
    }),
    /Invalid feature point/,
  );
  await assert.rejects(
    fetchTaxonomy({ ...env, EVALUATION_TOKEN: '' }, { fetcher }),
    /EVALUATION_TOKEN/,
  );
});

test('link submissions attach decisions to matching problems only', () => {
  const document = {
    ...mixed,
    links: [{ rel: 'report-archive', path: 'reports/3/index.html' }],
  };
  const [first, second] = problemSubmission(document).problems;
  const decision = {
    featurePointId: 47,
    method: 'rule',
    reason: 'pkg:@nocobase/db → 应用搭建/数据库',
  };
  const payload = reportLinkSubmission(document, { [first.key]: decision });
  assert.deepEqual(payload.problems[0], { ...first, classification: decision });
  assert.deepEqual(payload.problems[1], second);
  assert.deepEqual(
    reportLinkSubmission(document).problems,
    problemSubmission(document).problems,
  );
  for (const invalid of [
    { ...decision, featurePointId: 0 },
    { ...decision, method: 'human' },
    { ...decision, extra: 1 },
    { ...decision, reason: '' },
  ])
    assert.throws(() =>
      classificationsByItem({
        version: 1,
        items: [{ id: 'a', problems: { [first.key]: invalid } }],
      }),
    );
  assert.throws(() =>
    classificationsByItem({
      version: 1,
      items: [
        { id: 'a', problems: {} },
        { id: 'a', problems: {} },
      ],
    }),
  );
});

const known = (id, taskKey, fingerprints = []) => ({
  id,
  taskKey,
  title: `已有问题 ${id}`,
  description: '已有描述',
  status: 'pending',
  fingerprints,
});

test('problems are checked against their own task unless the receiver already knows their wording', (t) => {
  const { root, plan } = planFixture(t, [mixed, null, mixed]);
  const [first, ...rest] = problemSubmission(mixed).problems;
  assert.equal(first.taskKey, 'issue-3');
  const { classification, pending } = prepareProblemClassification({
    plan,
    planDirectory: root,
    taxonomy: taxonomyFor(),
    taskProblems: {
      version: 1,
      problems: [
        known(11, 'issue-3', [first.fingerprint]),
        known(12, 'issue-3'),
        known(13, 'preset-9'),
      ],
    },
    rules,
  });
  assert.deepEqual(
    pending.duplicates.map((item) => item.key),
    rest.map((problem) => problem.key),
  );
  for (const item of pending.duplicates) {
    assert.deepEqual(
      item.candidates.map((candidate) => candidate.id),
      [11, 12],
    );
    assert.deepEqual(Object.keys(item.candidates[0]).sort(), ['description', 'id', 'status', 'title']);
    assert.equal(item.items.join(), 'item-0,item-2');
  }
  // The feature point classifier sees no task identity.
  assert.ok(pending.problems.every((item) => !('taskKey' in item) && !('fingerprint' in item)));
  assert.deepEqual(duplicatesByItem(classification), new Map([['item-0', {}], ['item-2', {}]]));
  const none = prepareProblemClassification({ plan, planDirectory: root, taxonomy: taxonomyFor(), rules });
  assert.deepEqual(none.pending.duplicates, []);
});

test('duplicate judgements must name one of the problem\'s own candidates or none, once each', () => {
  const pending = {
    duplicates: [
      { key: 'a'.repeat(64), candidates: [{ id: 11 }, { id: 12 }] },
      { key: 'b'.repeat(64), candidates: [{ id: 13 }] },
    ],
  };
  const judge = (duplicates) => validateDuplicates({ version: 1, duplicates }, pending);
  const good = [
    { key: 'a'.repeat(64), problemId: 12, reason: '同一缺陷' },
    { key: 'b'.repeat(64), problemId: null, reason: '不同缺陷' },
  ];
  assert.deepEqual(judge(good).get('a'.repeat(64)), { problemId: 12, reason: '同一缺陷' });
  for (const bad of [
    good.slice(1),
    [good[0], good[0]],
    [{ ...good[0], problemId: 13 }, good[1]],
    [{ ...good[0], reason: ' ' }, good[1]],
    [good[0], { ...good[1], key: 'c'.repeat(64) }],
  ])
    assert.throws(() => judge(bad));
  assert.throws(() => validateDuplicates({ version: 1 }, pending));
  assert.equal(validateDuplicates({ version: 1 }, { duplicates: [] }).size, 0);
});

test('the Agent judges rewording in the same call, and only duplicates found are sent', async (t) => {
  const taskProblems = { version: 1, problems: [known(11, 'issue-3'), known(12, 'issue-3')] };
  const fixture = await modelFixture(t, undefined, { taskProblems });
  const result = await fixture.run();
  const judged = Object.entries(result.items[0].duplicates);
  assert.equal(judged.length, 4);
  assert.deepEqual(judged.map(([, value]) => value.problemId), [11, null, null, null]);
  assert.doesNotMatch(JSON.stringify(fixture.read('classification.json')), /fixture-secret/);
  const sent = duplicatesByItem(fixture.read('classification.json')).get('item-0');
  assert.deepEqual(Object.keys(sent), [judged[0][0]]);
  const document = { ...mixed, links: [{ rel: 'report-archive', path: 'reports/3/index.html' }] };
  const payload = reportLinkSubmission(document, {}, sent);
  assert.deepEqual(
    payload.problems.map((problem) => problem.duplicateOf?.problemId ?? null),
    [11, null, null, null],
  );
});

test('the Agent runs for possible duplicates even when rules place every problem', async (t) => {
  const document = documentFor('owner/repo/issues/4/initial', [finding('F1', ['pkg:@nocobase/db'])]);
  const fixture = await modelFixture(t, undefined, {
    documents: [document],
    taskProblems: { version: 1, problems: [known(21, 'issue-4')] },
  });
  const result = await fixture.run();
  assert.equal(fixture.calls(), 1);
  assert.equal(Object.values(result.items[0].problems)[0].method, 'rule');
  assert.equal(Object.values(result.items[0].duplicates)[0].problemId, 21);
});

test('an Agent failure sends no duplicate judgement', async (t) => {
  const fixture = await modelFixture(t, () => { throw new Error('provider failed'); }, {
    taskProblems: { version: 1, problems: [known(11, 'issue-3')] },
  });
  await assert.rejects(fixture.run());
  const saved = fixture.read('classification.json');
  assert.deepEqual([...duplicatesByItem(saved).values()], [{}]);
});

test('the delivered tasks\' problems are read beside the import endpoint in bounded requests', async (t) => {
  const documents = Array.from({ length: 51 }, (_, i) =>
    documentFor(`owner/repo/issues/${i + 1}/initial`, [finding('F1', ['pkg:@nocobase/db'])]));
  const { root, plan } = planFixture(t, documents);
  const seen = [];
  const fetcher = async (url, options) => {
    seen.push({ url: new URL(url), options });
    const tasks = new URL(url).searchParams.getAll('task');
    return new Response(JSON.stringify({ version: 1, problems: tasks.slice(0, 1).map((task, i) => ({ ...known(seen.length * 100 + i, task), extra: 1 })) }), { status: 200 });
  };
  const env = { EVALUATION_ENDPOINT: 'https://test3.example/main/api/evaluations/import', EVALUATION_TOKEN: 'receiver-key' };
  const result = await fetchTaskProblems(env, { plan, planDirectory: root, fetcher });
  assert.deepEqual(seen.map(({ url }) => url.pathname), ['/main/api/evaluations/task-problems', '/main/api/evaluations/task-problems']);
  assert.deepEqual(seen.map(({ url }) => url.searchParams.getAll('task').length), [50, 1]);
  assert.equal(seen[0].options.headers['x-api-key'], 'receiver-key');
  assert.equal(seen[0].options.redirect, 'manual');
  assert.equal(result.problems.length, 2);
  assert.equal(result.problems[0].extra, undefined);
  await assert.rejects(
    fetchTaskProblems(env, { plan, planDirectory: root, fetcher: async () => new Response('', { status: 404 }) }),
    /404/,
  );
  await assert.rejects(
    fetchTaskProblems(env, {
      plan, planDirectory: root,
      fetcher: async () => new Response(JSON.stringify({ version: 1, problems: [{ ...known(1, '../x') }] }), { status: 200 }),
    }),
    /Invalid task problem/,
  );
});

test('the public failure file and message are capped, and the Agent runs in summary mode', async (t) => {
  let detail;
  const long = `provider failed ${'TESTMANAGE-PROBLEM-TEXT '.repeat(100)}`;
  const fixture = await modelFixture(t, ({ args }) => {
    detail = args.consoleDetail;
    throw new Error(long);
  });
  await assert.rejects(fixture.run(), (error) => error.message.length < 600);
  assert.equal(detail, 'summary');
  const failure = fixture.read('failure.json');
  assert.ok(failure.error.length < 600, failure.error.length);
  assert.match(failure.error, new RegExp(`… \\(${long.length} chars\\)$`));
});

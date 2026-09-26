import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createClassificationInput,
  finalizeClassification,
  projectClassification,
  validateClassification,
  validateClassificationInput,
} from '../../reports/findings-classification.mjs';
import {
  readClassificationJson,
  runClassification,
} from '../classify-findings.mjs';

const occurrence = (issue, edit = {}) => ({
  report: `${issue}:100:1`,
  issue,
  taskTitle: '任务',
  targets: ['@nocobase/db'],
  paths: ['packages/@nocobase/db/index.ts'],
  evidence: [{ path: 'packages/@nocobase/db/index.ts', excerpt: 'raw source' }],
  appVersion: '1.0.0-beta.47',
  appTemplate: '@nocobase/app-template-default',
  finding: { id: 'F1', title: '示例问题', detail: '现有观察', ...edit },
});
const inputFor = (...items) => createClassificationInput(items);
const draftFor = (input) => ({
  version: 1,
  inputHash: input.inputHash,
  groups: [
    {
      title: '同一根因',
      reason: '共同入口的相同触发条件与行为',
      members: input.findings.map((item) => item.id),
    },
  ],
});
const save = (file, value) => writeFileSync(file, JSON.stringify(value));

test('fingerprints cover versions, evidence and full descriptions, independent of report ordering', () => {
  const a = occurrence(1),
    b = occurrence(2);
  const input = inputFor(a, b);
  assert.deepEqual(inputFor(b, a), input);
  for (const modified of [
    { ...a, appVersion: '1.0.0-beta.48' },
    { ...a, evidence: [{ path: 'different.ts', excerpt: 'changed' }] },
    occurrence(1, { detail: '另一根因' }),
  ])
    assert.notEqual(inputFor(modified, b).inputHash, input.inputHash);
  input.findings[0].finding.title = 'tampered';
  assert.throws(() => validateClassificationInput(input), /fingerprint/);
});

test('reject missing, duplicate, unknown and same-report members and empty explanations', () => {
  const input = inputFor(occurrence(1), occurrence(2));
  const mutations = [
    (draft) => draft.groups[0].members.pop(),
    (draft) => draft.groups[0].members.push(draft.groups[0].members[0]),
    (draft) => draft.groups[0].members.push('unknown'),
    (draft) => draft.groups.push(globalThis.structuredClone(draft.groups[0])),
    (draft) => {
      draft.groups[0].reason = '';
    },
    (draft) => {
      draft.inputHash = 'a'.repeat(64);
    },
  ];
  for (const mutate of mutations) {
    const draft = draftFor(input);
    mutate(draft);
    assert.throws(() => finalizeClassification(draft, input));
  }
  const sameReport = inputFor(occurrence(1), occurrence(1, { id: 'F2' }));
  assert.throws(
    () => finalizeClassification(draftFor(sameReport), sameReport),
    /same report/,
  );
});

test('new findings stay pending while previous unchanged groups survive and revised findings detach', () => {
  const a = occurrence(1),
    b = occurrence(2),
    c = occurrence(3);
  const input = inputFor(a, b);
  const classification = finalizeClassification(draftFor(input), input);
  const next = inputFor(a, b, c);
  let projected = projectClassification(next, classification);
  assert.equal(projected.pending, 1);
  assert.equal(projected.current, false);
  assert.deepEqual(
    projected.groups[0].members,
    classification.groups[0].members,
  );
  projected = projectClassification(
    inputFor(occurrence(1, { detail: '变更' }), b, c),
    classification,
  );
  assert.equal(projected.pending, 2);
  assert.deepEqual(projected.groups[0].members, [input.findings[1].id]);
  projected = projectClassification(inputFor(b), classification);
  assert.equal(projected.pending, 0);
  assert.equal(projected.groups.length, 1);
  assert.throws(() => validateClassification(classification, next), /Stale/);
});

test('a damaged cached decision exposes every finding as pending instead of guessing', () => {
  const input = inputFor(occurrence(1), occurrence(2));
  const classification = finalizeClassification(draftFor(input), input);
  classification.groups[0].members.push('unknown');
  const projected = projectClassification(input, classification);
  assert.equal(projected.pending, 2);
  assert.equal(projected.current, false);
  assert.ok(
    projected.groups.every(
      (group) => !group.reviewed && group.members.length === 1,
    ),
  );
});

async function invokeFixture(t, edit) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'test-findings-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const inputDirectory = path.join(root, 'input'),
    outputDirectory = path.join(root, 'output');
  mkdirSync(inputDirectory);
  const input = inputFor(occurrence(1), occurrence(2));
  save(path.join(inputDirectory, 'input.json'), input);
  save(path.join(inputDirectory, 'previous.json'), []);
  let workspace;
  const adapter = {
    id: 'pi',
    version: '1.0.0',
    credentials: ['CODE_AGENT_API_KEY'],
    parseEvent: () => ({}),
    createInvocation(args) {
      workspace = args.workspace;
      assert.equal(args.env.GITHUB_TOKEN, undefined);
      assert.equal(args.env.GH_TOKEN, undefined);
      assert.equal(args.env.CODEX_API_KEY, undefined);
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
    assert.equal(args.invocationTimeoutSeconds, 30);
    assert.equal(args.idleTimeoutSeconds, 30);
    const index = JSON.parse(
      readFileSync(path.join(args.cwd, 'index.json'), 'utf8'),
    );
    assert.equal(index.findings.length, input.findings.length);
    assert.ok(index.findings.every((item) => !('evidence' in item)));
    for (const item of index.findings)
      assert.deepEqual(
        JSON.parse(
          readFileSync(path.join(args.cwd, item.evidenceFile), 'utf8'),
        ),
        input.findings.find((source) => source.id === item.id),
      );
    const draft = draftFor(input);
    args.result.observe({ complete: true }, '{}');
    args.result.save(
      args.log,
      { status: 'completed', exitCode: 0 },
      (value) => value,
    );
    save(path.join(args.cwd, 'classification.json'), draft);
    await edit?.({ args, draft, input });
  };
  const run = () =>
    runClassification(inputDirectory, outputDirectory, {
      adapter,
      invoke,
      env: {
        CODE_AGENT_ENGINE: 'pi',
        FACTORY_FINDINGS_TIMEOUT_SECONDS: '30',
        CODE_AGENT_API_KEY: 'fixture-secret',
        GITHUB_TOKEN: 'must-not-pass',
        GH_TOKEN: 'must-not-pass',
        CODEX_API_KEY: 'wrong-engine',
      },
    });
  return { root, input, outputDirectory, run, workspace: () => workspace };
}

test('Agent runner validates output, captures invocation facts and removes private workspace', async (t) => {
  const fixture = await invokeFixture(t);
  const result = await fixture.run();
  assert.equal(result.inputHash, fixture.input.inputHash);
  assert.equal(result.classifier.model, 'fixture');
  assert.ok(
    existsSync(
      path.join(
        fixture.outputDirectory,
        'agent-findings.jsonl.invocation.json',
      ),
    ),
  );
  assert.ok(
    existsSync(
      path.join(fixture.outputDirectory, 'agent-findings.jsonl.prompt.md'),
    ),
  );
  assert.ok(
    existsSync(path.join(fixture.outputDirectory, 'classification.json')),
  );
  assert.equal(existsSync(fixture.workspace()), false);
});

for (const mode of ['timeout', 'invalid-output', 'edited-input', 'throw']) {
  test(`Agent ${mode} cannot publish decisions or erase pending findings`, async (t) => {
    const fixture = await invokeFixture(t, ({ args, draft, input }) => {
      if (mode === 'timeout')
        args.result.save(
          args.log,
          { status: 'timed_out', exitCode: null },
          (value) => value,
        );
      if (mode === 'invalid-output') {
        draft.groups[0].members.pop();
        save(path.join(args.cwd, 'classification.json'), draft);
      }
      if (mode === 'edited-input') {
        input.findings[0].finding.title = 'tampered';
        save(path.join(args.cwd, 'input.json'), input);
      }
      if (mode === 'throw') throw new Error('provider failed fixture-secret');
    });
    await assert.rejects(fixture.run());
    assert.equal(
      existsSync(path.join(fixture.outputDirectory, 'classification.json')),
      false,
    );
    assert.ok(existsSync(path.join(fixture.outputDirectory, 'failure.json')));
    assert.doesNotMatch(
      readFileSync(path.join(fixture.outputDirectory, 'failure.json'), 'utf8'),
      /fixture-secret/,
    );
    assert.equal(existsSync(fixture.workspace()), false);
  });
}

test('classification JSON cannot be a symlink', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'test-findings-link-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  save(path.join(root, 'data.json'), {});
  symlinkSync(path.join(root, 'data.json'), path.join(root, 'link.json'));
  assert.throws(
    () => readClassificationJson(path.join(root, 'link.json')),
    /Invalid/,
  );
});

test('Agent execution stays outside trusted publication and only the short deployment holds the report lock', () => {
  const workflow = readFileSync(
    new URL('../../workflows/classify-findings.yml', import.meta.url),
    'utf8',
  );
  const [classify, publish] = workflow.split('\n  publish:');
  assert.match(classify, /contents: read/);
  assert.doesNotMatch(classify, /contents: write|group: factory-task-usage/);
  for (const engine of ['codebuddy', 'claude-code', 'codex', 'opencode'])
    assert.ok(classify.includes(`vars.CODE_AGENT_ENGINE == '${engine}'`));
  assert.match(classify, /classify-findings.mjs prepare/);
  assert.match(classify, /classify-findings.mjs run/);
  assert.match(publish, /group: factory-task-usage/);
  assert.match(publish, /classify-findings.mjs publish/);
  assert.doesNotMatch(
    publish,
    /secrets\.|install-agent|classify-findings.mjs run/,
  );
  assert.match(publish, /steps.archive.outputs.commit_sha/);
  assert.match(publish, /actions\/deploy-pages@v4/);
  const reporter = readFileSync(
    new URL('../../workflows/report-task-usage.yml', import.meta.url),
    'utf8',
  );
  assert.match(reporter, /needs.pages.outputs.findings_pending == 'true'/);
  assert.match(reporter, /gh workflow run classify-findings.yml/);
  assert.doesNotMatch(reporter, /secrets\.|install-agent/);
});

test('a failed retry removes a previous result instead of exporting it as fresh', async (t) => {
  let calls = 0;
  const fixture = await invokeFixture(t, () => {
    if (++calls > 1) throw new Error('failed retry');
  });
  await fixture.run();
  await assert.rejects(fixture.run(), /failed retry/);
  assert.equal(
    existsSync(path.join(fixture.outputDirectory, 'classification.json')),
    false,
  );
});

test('credential redaction preserves JSON syntax in Agent prose', async (t) => {
  const fixture = await invokeFixture(t, ({ args, draft }) => {
    draft.groups[0].reason = '引用 "fixture-secret" 的说明';
    save(path.join(args.cwd, 'classification.json'), draft);
  });
  const result = await fixture.run();
  assert.match(result.groups[0].reason, /REDACTED/);
  assert.doesNotMatch(JSON.stringify(result), /fixture-secret/);
});

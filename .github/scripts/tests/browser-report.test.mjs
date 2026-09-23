import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const validator = path.resolve(
  import.meta.dirname,
  '..',
  'validate-browser-report.mjs',
);

test('browser report requires real commands, every criterion, and PNG evidence', () => {
  const fixture = createFixture();
  try {
    const result = runValidator(fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /acceptance passed with 2 check/);
  } finally {
    fixture.cleanup();
  }
});

test('valid failed browser report uses the repairable exit code', () => {
  const fixture = createFixture();
  try {
    fixture.report.passed = false;
    fixture.report.checks[1].status = 'failed';
    fixture.report.failures = ['Return action did not change the status.'];
    writeReport(fixture);

    const result = runValidator(fixture);
    assert.equal(result.status, 10, result.stderr);
    assert.match(result.stderr, /acceptance failed/);
  } finally {
    fixture.cleanup();
  }
});

test('structured failure details are normalized and remain repairable', () => {
  const fixture = createFixture();
  try {
    fixture.report.passed = false;
    fixture.report.checks[1].status = 'failed';
    fixture.report.failures = [
      {
        criterion: 'Edit a record',
        reproduction: [
          'Open the equipment list.',
          'Click Edit on an existing row.',
        ],
        observed: 'Every required field is empty.',
        impact: 'The employee must re-enter unchanged values.',
      },
    ];
    writeReport(fixture);

    const result = runValidator(fixture);
    assert.equal(result.status, 10, result.stderr);
    assert.match(result.stdout, /Normalized an equivalent/);
    const normalized = JSON.parse(readFileSync(fixture.reportFile, 'utf8'));
    assert.equal(typeof normalized.failures[0], 'string');
    assert.match(normalized.failures[0], /Every required field is empty/);
    assert.match(normalized.failures[0], /Click Edit/);
  } finally {
    fixture.cleanup();
  }
});

test('equivalent QA report schema is normalized and remains repairable', () => {
  const fixture = createFixture();
  try {
    writeFileSync(
      fixture.reportFile,
      JSON.stringify({
        roles_tested: ['admin', 'regular_user'],
        criteria: [
          {
            id: 1,
            name: 'Create a record',
            result: 'PASS',
            details: 'Created a record and observed it in the table.',
            evidence: ['criterion-1.png'],
          },
          {
            id: 2,
            name: 'Return a record',
            result: 'FAIL',
            details: 'The return action left the record borrowed.',
            evidence: ['criterion-2.png'],
          },
        ],
        summary: {
          passed: 1,
          failed: 1,
          defects: [
            {
              description: 'Return did not update the status.',
              repro: 'Open the record and click Return.',
            },
          ],
        },
      }),
    );

    const result = runValidator(fixture);
    assert.equal(result.status, 10, result.stderr);
    assert.match(result.stdout, /Normalized an equivalent/);
    const normalized = JSON.parse(readFileSync(fixture.reportFile, 'utf8'));
    assert.equal(normalized.passed, false);
    assert.equal(normalized.authenticated, true);
    assert.equal(normalized.checks[1].status, 'failed');
    assert.equal(normalized.checks[1].criterion, 'Return a record');
    assert.match(normalized.failures[0], /Return did not update/);
  } finally {
    fixture.cleanup();
  }
});

test('QA checks using name, details, and evidence screenshots are normalized', () => {
  const fixture = createFixture();
  try {
    writeFileSync(
      fixture.reportFile,
      JSON.stringify({
        passed: false,
        authenticated: true,
        summary: 'Navigation is intermittently denied.',
        checks: [
          {
            id: 'criterion-1',
            name: 'Create a record',
            status: 'passed',
            details: 'Created a record and observed it in the table.',
            evidence: ['criterion-1.png'],
          },
          {
            id: 'criterion-2',
            name: 'Return a record',
            status: 'failed',
            details: 'The route guard displayed Access denied.',
            evidence: ['criterion-2.png'],
          },
        ],
        failures: [
          {
            title: 'Intermittent route denial',
            repro: 'Switch users, then open the equipment page.',
            actual: 'Access denied appears while the API returns 200.',
            impact: 'The main workflow is unreliable.',
          },
        ],
      }),
    );

    const result = runValidator(fixture);
    assert.equal(result.status, 10, result.stderr);
    assert.match(result.stdout, /Normalized an equivalent/);
    const normalized = JSON.parse(readFileSync(fixture.reportFile, 'utf8'));
    assert.deepEqual(normalized.checks[0].screenshots, ['criterion-1.png']);
    assert.equal(normalized.checks[1].criterion, 'Return a record');
    assert.match(normalized.checks[1].actions[0], /Access denied/);
    assert.match(normalized.failures[0], /API returns 200/);
  } finally {
    fixture.cleanup();
  }
});

test('QA check status is the verdict; negated observations stay passed', () => {
  const fixture = createFixture();
  try {
    fixture.report.checks[1] = {
      criterion: '编辑记录',
      status: 'passed',
      actions: ['打开编辑弹窗，确认已有值正确回填，修改说明后保存。'],
      evidence: [
        '全流程未出现 “Something went wrong”，无空白字段。',
        'The page did not show Something went wrong; required fields were not empty.',
      ],
      screenshots: ['criterion-2.png'],
    };
    writeReport(fixture);
    const result = runValidator(fixture);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(fixture.reportFile, 'utf8'));
    assert.equal(report.checks[1].status, 'passed');
    assert.deepEqual(report.failures, []);
  } finally {
    fixture.cleanup();
  }
});

test('a passed edit check is not returned to QA for missing prefill wording', () => {
  const fixture = createFixture();
  try {
    fixture.report.checks[1].criterion = '编辑记录';
    writeReport(fixture);
    const result = runValidator(fixture);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    fixture.cleanup();
  }
});

test('browser report cannot pass without recorded browser interaction', () => {
  const fixture = createFixture();
  try {
    writeFileSync(fixture.commands, 'open\nsnapshot\nscreenshot\n');
    const result = runValidator(fixture);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /No real agent-browser interaction/);
  } finally {
    fixture.cleanup();
  }
});

test('a failed QA check requests repair even when the summary claims success', () => {
  const fixture = createFixture();
  try {
    fixture.report.checks[1] = {
      criterion: '编辑记录',
      status: 'failed',
      actions: ['打开编辑弹窗。'],
      evidence: ['打开编辑弹窗后，必填字段为空，需要重新填写。'],
      screenshots: ['criterion-2.png'],
    };
    fixture.report.failures = ['编辑记录：已有值未回填。'];
    writeReport(fixture);
    const result = runValidator(fixture);
    assert.equal(result.status, 10, result.stderr);
    assert.match(result.stderr, /已有值未回填/);
    const report = JSON.parse(readFileSync(fixture.reportFile, 'utf8'));
    assert.equal(report.passed, false);
    assert.equal(report.checks[0].status, 'passed');
  } finally {
    fixture.cleanup();
  }
});

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-browser-report-'));
  const evidence = path.join(root, 'evidence');
  const metadata = path.join(root, 'metadata.json');
  const reportFile = path.join(root, 'report.json');
  const commands = path.join(root, 'commands.log');
  mkdirSync(evidence);

  writeFileSync(
    metadata,
    JSON.stringify({
      task: {
        acceptanceCriteria: '1. Create a record\n2. Return a record',
      },
    }),
  );
  writeFileSync(
    path.join(evidence, 'criterion-1.png'),
    Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      Buffer.alloc(1_100),
    ]),
  );
  writeFileSync(
    path.join(evidence, 'criterion-2.png'),
    Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      Buffer.alloc(1_100),
    ]),
  );
  writeFileSync(commands, 'skills\nopen\nsnapshot\nfill\nclick\nscreenshot\n');

  const report = {
    passed: true,
    authenticated: true,
    summary: 'All acceptance criteria passed.',
    checks: [
      {
        criterion: 'Create a record',
        status: 'passed',
        actions: ['Created a record through the form.'],
        evidence: ['The new record appeared in the table.'],
        screenshots: ['criterion-1.png'],
      },
      {
        criterion: 'Return a record',
        status: 'passed',
        actions: ['Returned the created record.'],
        evidence: ['The status changed to returned.'],
        screenshots: ['criterion-2.png'],
      },
    ],
    failures: [],
  };
  writeFileSync(reportFile, JSON.stringify(report));

  return {
    root,
    evidence,
    metadata,
    reportFile,
    commands,
    report,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function runValidator(fixture) {
  return spawnSync(
    process.execPath,
    [
      validator,
      '--metadata',
      fixture.metadata,
      '--report',
      fixture.reportFile,
      '--commands',
      fixture.commands,
      '--evidence',
      fixture.evidence,
    ],
    { encoding: 'utf8' },
  );
}

// These tests vary the business scenario. Keep its
// requested criterion in sync; missing/duplicate/unknown IDs have separate tests.
function writeReport(fixture) {
  writeFileSync(fixture.metadata, JSON.stringify({ task: { acceptanceCriteria:
    fixture.report.checks.map((c, i) => `${i + 1}. ${c.criterion}`).join('\n'),
  } }));
  writeFileSync(fixture.reportFile, JSON.stringify(fixture.report));
}

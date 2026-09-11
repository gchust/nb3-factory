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
    writeFileSync(fixture.reportFile, JSON.stringify(fixture.report));

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
    writeFileSync(fixture.reportFile, JSON.stringify(fixture.report));

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

test('passed edit report cannot hide empty required fields behind a workaround', () => {
  const fixture = createFixture();
  try {
    fixture.report.checks[1] = {
      criterion: 'Edit a record',
      status: 'passed',
      actions: [
        'The edit form opened with empty required fields, so all values were entered again before saving.',
      ],
      evidence: [
        'Save first showed Something went wrong; entering the asset number made it succeed.',
      ],
      screenshots: ['criterion-2.png'],
    };
    writeFileSync(fixture.reportFile, JSON.stringify(fixture.report));

    const result = runValidator(fixture);
    assert.equal(result.status, 10, result.stderr);
    assert.match(result.stderr, /semantic guard failed/);
    assert.match(result.stderr, /Something went wrong/);
    assert.match(result.stderr, /existing values were prefilled/);
    const guarded = JSON.parse(readFileSync(fixture.reportFile, 'utf8'));
    assert.equal(guarded.passed, false);
    assert.equal(guarded.checks[1].status, 'failed');
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

test('missing edit evidence in a delivery summary returns to QA without inventing a business defect', () => {
  const fixture = createFixture();
  try {
    fixture.report.checks[0] = {
      criterion: 'Edit a record',
      status: 'passed',
      actions: ['Opened Edit and verified the existing values were prefilled.'],
      evidence: [
        'Changed the description, saved, and verified it after reload.',
      ],
      screenshots: ['criterion-1.png'],
    };
    fixture.report.checks[1] = {
      criterion:
        'Capture screenshots and recordings of create, edit and delete for the PR',
      status: 'passed',
      actions: ['Recorded the required scenarios.'],
      evidence: ['Saved screenshots and WebM recordings.'],
      screenshots: ['criterion-2.png'],
    };
    writeFileSync(fixture.reportFile, JSON.stringify(fixture.report));

    const result = runValidator(fixture);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /Invalid Agent Browser report/);
    assert.match(result.stderr, /already verified edit scenario/);
    const report = JSON.parse(readFileSync(fixture.reportFile, 'utf8'));
    assert.deepEqual(report.failures, []);
    assert.equal(report.checks[1].status, 'passed');

    // QA can associate the real edit evidence with the delivery check,
    // without touching the application or rerunning its migrations/build.
    fixture.report.checks[1].evidence.push(
      'The edit scenario above verified existing values were prefilled, as shown in criterion-1.png.',
    );
    fixture.report.checks[1].screenshots.push('criterion-1.png');
    writeFileSync(fixture.reportFile, JSON.stringify(fixture.report));
    assert.equal(runValidator(fixture).status, 0);
  } finally {
    fixture.cleanup();
  }
});

test('an unverified edit remains incomplete even without an observed defect', () => {
  const fixture = createFixture();
  try {
    fixture.report.checks[1].criterion = '编辑记录';
    writeFileSync(fixture.reportFile, JSON.stringify(fixture.report));
    const result = runValidator(fixture);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /existing values were prefilled/);
  } finally {
    fixture.cleanup();
  }
});

test('observed empty edit fields remain an application defect without a generic error', () => {
  const fixture = createFixture();
  try {
    fixture.report.checks[1].criterion = '编辑记录';
    fixture.report.checks[1].evidence = [
      '打开编辑弹窗后，必填字段为空，需要重新填写。',
    ];
    writeFileSync(fixture.reportFile, JSON.stringify(fixture.report));
    const result = runValidator(fixture);
    assert.equal(result.status, 10);
    assert.match(result.stderr, /did not preserve existing required values/);
  } finally {
    fixture.cleanup();
  }
});

test('observed business failures take priority over gaps in another check', () => {
  const fixture = createFixture();
  try {
    fixture.report.passed = false;
    fixture.report.checks[0].status = 'failed';
    fixture.report.failures = ['Create returned HTTP 500.'];
    fixture.report.checks[1].criterion = 'Record editing for the PR';
    writeFileSync(fixture.reportFile, JSON.stringify(fixture.report));
    const result = runValidator(fixture);
    assert.equal(result.status, 10);
    assert.match(result.stderr, /Create returned HTTP 500/);
  } finally {
    fixture.cleanup();
  }
});

test('a successful edit observation may mention the absence of blank fields', () => {
  const fixture = createFixture();
  try {
    fixture.report.checks[1].criterion = '编辑记录';
    fixture.report.checks[1].evidence = [
      '已有值正确回填，无空白字段。',
      'Existing values were prefilled; no empty required fields were shown.',
    ];
    writeFileSync(fixture.reportFile, JSON.stringify(fixture.report));
    const result = runValidator(fixture);
    assert.equal(result.status, 0, result.stderr);
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

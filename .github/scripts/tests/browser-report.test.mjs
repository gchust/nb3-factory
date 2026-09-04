import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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

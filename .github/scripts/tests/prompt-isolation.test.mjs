import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const scripts = path.resolve(import.meta.dirname, '..');
const prompts = path.resolve(scripts, '../prompts');
function fixture(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-prompt-isolation-'));
  const write = (name, value) => {
    const file = path.join(root, name);
    writeFileSync(
      file,
      typeof value === 'string' ? value : JSON.stringify(value),
    );
    return file;
  };
  const build = (script, args) => {
    const output = path.join(root, 'output.md');
    execFileSync(
      process.execPath,
      [
        path.join(scripts, script),
        ...Object.entries({ ...args, output }).flatMap(([key, value]) => [
          `--${key}`,
          value,
        ]),
      ],
      { stdio: 'pipe' },
    );
    return readFileSync(output, 'utf8');
  };
  try {
    run({ root, write, build });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('implementation excludes acceptance and Issue URL; QA still receives both product and criteria', () =>
  fixture(({ write, build }) => {
    const metadata = write('metadata.json', {
      issue: { number: 1, title: 'Business app', url: 'ISSUE_URL_SENTINEL' },
      task: {
        targetBranch: 'apps/test',
        taskType: 'new',
        requirements: 'PRODUCT_REQUIREMENT_SENTINEL',
        acceptanceCriteria: 'QA_ONLY_SENTINEL',
        sampleData: 'yes',
      },
    });
    const implementation = build('build-prompt.mjs', {
      metadata,
      template: path.join(prompts, 'implement.md'),
    });
    assert.match(implementation, /PRODUCT_REQUIREMENT_SENTINEL/);
    assert.doesNotMatch(
      implementation,
      /QA_ONLY_SENTINEL|ISSUE_URL_SENTINEL|authorized-issue-acceptance/,
    );
    const qa = build('build-browser-prompt.mjs', {
      metadata,
      template: path.join(prompts, 'browser-acceptance.md'),
    });
    assert.match(qa, /PRODUCT_REQUIREMENT_SENTINEL/);
    assert.match(qa, /QA_ONLY_SENTINEL/);
    assert.throws(
      () =>
        build('build-prompt.mjs', {
          metadata,
          template: write('bad-template.md', '{{ACCEPTANCE_CRITERIA}}'),
        }),
      /must not request QA/,
    );
  }));

test('browser repairs get only failed actions and observations, never raw transcript or passing checks', () =>
  fixture(({ write, build }) => {
    const output = build('build-repair-prompt.mjs', {
      template: path.join(prompts, 'repair.md'),
      task: write('task.md', 'PRODUCT'),
      log: write('qa.log', 'QA_PROMPT_SECRET'),
      'failure-kind': 'browser',
      'application-log': write('server.log', 'SERVER_LOG'),
      report: write('report.json', {
        passed: false,
        authenticated: true,
        summary: 'PRIVATE_SUMMARY',
        failures: ['PRIVATE_CRITERION_COPY'],
        checks: [
          {
            criterion: 'PRIVATE_CRITERION',
            status: 'failed',
            actions: ['Click save'],
            evidence: ['Server returned 500'],
            screenshots: ['PRIVATE_SCREENSHOT'],
          },
          {
            criterion: 'PRIVATE_PASS',
            status: 'passed',
            actions: ['PASS_ACTION'],
            evidence: ['PASS_EVIDENCE'],
          },
        ],
      }),
    });
    assert.match(output, /Click save/);
    assert.match(output, /Server returned 500/);
    assert.doesNotMatch(
      output,
      /PRIVATE_|QA_PROMPT_SECRET|PASS_ACTION|PASS_EVIDENCE|SERVER_LOG/,
    );
  }));

test('startup failures use application diagnostics and build failures keep compiler output', () =>
  fixture(({ root, write, build }) => {
    const args = {
      template: path.join(prompts, 'repair.md'),
      task: write('task.md', 'PRODUCT'),
      log: write('qa.log', 'COMPILER_DIAGNOSTIC'),
      report: path.join(root, 'missing.json'),
      'application-log': write('server.log', 'STARTUP_ERROR'),
    };
    const browser = build('build-repair-prompt.mjs', {
      ...args,
      'failure-kind': 'browser',
    });
    assert.match(browser, /STARTUP_ERROR/);
    assert.doesNotMatch(browser, /COMPILER_DIAGNOSTIC/);
    assert.match(
      build('build-repair-prompt.mjs', { ...args, 'failure-kind': 'build' }),
      /COMPILER_DIAGNOSTIC/,
    );
    assert.throws(
      () =>
        build('build-repair-prompt.mjs', {
          ...args,
          'failure-kind': 'browser',
          report: write('bad.json', { checks: [] }),
        }),
      /No observed failed checks/,
    );
  }));

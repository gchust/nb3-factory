import { Buffer } from 'node:buffer';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const metadata = JSON.parse(readFileSync(args.metadata, 'utf8'));
const rawReport = readJson(args.report);
const report = normalizeReport(rawReport, metadata);
const commands = readFileSync(args.commands, 'utf8')
  .split(/\r?\n/u)
  .filter(Boolean);
const evidenceRoot = path.resolve(args.evidence);

validateShape(report);
validateBrowserCommands(commands);

const minimumChecks = countAcceptanceCriteria(
  metadata.task?.acceptanceCriteria ?? '',
);
if (report.checks.length < minimumChecks) {
  invalid(
    `Browser report has ${report.checks.length} check(s), but at least ${minimumChecks} acceptance check(s) are required.`,
  );
}

if (report !== rawReport) {
  writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    'Normalized an equivalent Agent Browser report to the factory report schema.',
  );
}

let screenshotCount = 0;
for (const [index, check] of report.checks.entries()) {
  if (!check || typeof check !== 'object') {
    invalid(`checks[${index}] must be an object.`);
  }
  requireString(check.criterion, `checks[${index}].criterion`);
  if (!['passed', 'failed'].includes(check.status)) {
    invalid(`checks[${index}].status must be passed or failed.`);
  }
  requireNonEmptyStrings(check.actions, `checks[${index}].actions`);
  requireNonEmptyStrings(check.evidence, `checks[${index}].evidence`);
  requireNonEmptyStrings(check.screenshots, `checks[${index}].screenshots`);

  for (const screenshot of check.screenshots) {
    const screenshotPath = path.resolve(evidenceRoot, screenshot);
    const relative = path.relative(evidenceRoot, screenshotPath);
    if (
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      !/^[A-Za-z0-9][A-Za-z0-9-]*\.png$/u.test(screenshot)
    ) {
      invalid(`Unsafe screenshot path in checks[${index}]: ${screenshot}`);
    }
    let stat;
    try {
      stat = statSync(screenshotPath);
    } catch {
      invalid(`Screenshot does not exist: ${screenshot}`);
    }
    if (!stat.isFile() || stat.size < 1_000) {
      invalid(`Screenshot is empty or invalid: ${screenshot}`);
    }
    const signature = readFileSync(screenshotPath).subarray(0, 8);
    if (!signature.equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
      invalid(`Screenshot is not a PNG file: ${screenshot}`);
    }
    screenshotCount += 1;
  }
}

if (screenshotCount === 0)
  invalid('At least one browser screenshot is required.');

const failedChecks = report.checks.filter((check) => check.status === 'failed');
const claimsSuccess =
  report.passed === true &&
  report.authenticated === true &&
  failedChecks.length === 0 &&
  report.failures.length === 0;

if (claimsSuccess) {
  console.log(
    `Agent Browser acceptance passed with ${report.checks.length} check(s) and ${screenshotCount} screenshot(s).`,
  );
  process.exit(0);
}

console.error('Agent Browser acceptance failed:');
console.error(JSON.stringify(report, null, 2));
process.exit(10);

function validateShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid('Browser report must be a JSON object.');
  }
  if (typeof value.passed !== 'boolean') {
    invalid('Browser report passed must be a boolean.');
  }
  if (typeof value.authenticated !== 'boolean') {
    invalid('Browser report authenticated must be a boolean.');
  }
  requireString(value.summary, 'summary');
  if (!Array.isArray(value.checks)) invalid('checks must be an array.');
  if (!Array.isArray(value.failures)) invalid('failures must be an array.');
  for (const [index, failure] of value.failures.entries()) {
    requireString(failure, `failures[${index}]`);
  }
}

function normalizeReport(value, taskMetadata) {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.passed === 'boolean' &&
    typeof value.authenticated === 'boolean' &&
    Array.isArray(value.checks) &&
    Array.isArray(value.failures)
  ) {
    return value;
  }

  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Array.isArray(value.criteria)
  ) {
    return value;
  }

  const originalCriteria = parseAcceptanceCriteria(
    taskMetadata.task?.acceptanceCriteria ?? '',
  );
  const checks = value.criteria.map((criterion, index) => {
    if (!criterion || typeof criterion !== 'object') {
      invalid(`criteria[${index}] must be an object.`);
    }
    const result = String(criterion.result ?? '')
      .trim()
      .toLowerCase();
    if (!['pass', 'passed', 'fail', 'failed'].includes(result)) {
      invalid(
        `criteria[${index}].result must be PASS, PASSED, FAIL, or FAILED.`,
      );
    }
    requireString(criterion.details, `criteria[${index}].details`);
    requireNonEmptyStrings(criterion.evidence, `criteria[${index}].evidence`);

    return {
      criterion:
        originalCriteria[index] ||
        String(criterion.name ?? '').trim() ||
        `Acceptance criterion ${index + 1}`,
      status: result.startsWith('pass') ? 'passed' : 'failed',
      actions: [criterion.details.trim()],
      evidence: [criterion.details.trim()],
      screenshots: criterion.evidence,
    };
  });

  const failedChecks = checks.filter((check) => check.status === 'failed');
  const defects = Array.isArray(value.summary?.defects)
    ? value.summary.defects
        .map((defect) => formatDefect(defect))
        .filter(Boolean)
    : [];
  const failures =
    defects.length > 0
      ? defects
      : failedChecks.map(
          (check) => `${check.criterion}: ${check.evidence.join(' ')}`,
        );
  const passed = failedChecks.length === 0;
  const authenticated =
    value.authenticated === true ||
    (Array.isArray(value.roles_tested) && value.roles_tested.length > 0);
  const summary =
    typeof value.summary === 'string' && value.summary.trim()
      ? value.summary.trim()
      : `Agent Browser reported ${checks.length - failedChecks.length} passed and ${failedChecks.length} failed acceptance check(s).`;

  return {
    passed,
    authenticated,
    summary,
    checks,
    failures,
  };
}

function formatDefect(defect) {
  if (typeof defect === 'string') return defect.trim();
  if (!defect || typeof defect !== 'object') return '';
  const description = String(defect.description ?? '').trim();
  const reproduction = String(defect.repro ?? '').trim();
  if (!description) return '';
  return reproduction
    ? `${description} Reproduce: ${reproduction}`
    : description;
}

function validateBrowserCommands(commands) {
  const observed = new Set(commands);
  const requirements = [
    [['open', 'goto', 'navigate', 'batch'], 'navigation'],
    [['snapshot', 'batch'], 'snapshot'],
    [
      ['fill', 'type', 'click', 'press', 'select', 'check', 'eval', 'batch'],
      'interaction',
    ],
    [['screenshot', 'batch'], 'screenshot'],
  ];
  for (const [alternatives, description] of requirements) {
    if (!alternatives.some((command) => observed.has(command))) {
      invalid(`No real agent-browser ${description} command was recorded.`);
    }
  }
}

function countAcceptanceCriteria(text) {
  return Math.max(1, parseAcceptanceCriteria(text).length);
}

function parseAcceptanceCriteria(text) {
  const lines = String(text)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const listItems = lines
    .filter((line) => /^(?:\d+[.)]|[-*])\s+/u.test(line))
    .map((line) => line.replace(/^(?:\d+[.)]|[-*])\s+/u, '').trim());
  return listItems.length > 0 ? listItems : lines.slice(0, 1);
}

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    invalid(`${name} must be a non-empty string.`);
  }
}

function requireNonEmptyStrings(value, name) {
  if (!Array.isArray(value) || value.length === 0) {
    invalid(`${name} must be a non-empty array.`);
  }
  for (const [index, item] of value.entries()) {
    requireString(item, `${name}[${index}]`);
  }
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    invalid(`Cannot read valid browser report JSON: ${error.message}`);
  }
}

function invalid(message) {
  console.error(`Invalid Agent Browser report: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    parsed[argv[index]?.replace(/^--/, '')] = argv[index + 1];
  }
  for (const name of ['metadata', 'report', 'commands', 'evidence']) {
    if (!parsed[name]) throw new Error(`Missing --${name}`);
  }
  return parsed;
}

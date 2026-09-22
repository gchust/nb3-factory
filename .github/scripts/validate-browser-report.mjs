import { acceptanceCriteria, validateCoverage } from './acceptance-criteria.mjs';
import { validateCheck } from './browser-report-check.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const metadata = JSON.parse(readFileSync(args.metadata, 'utf8'));
let report;
const rawReport = readJson(args.report);
report = normalizeReport(rawReport);
const commands = readFileSync(args.commands, 'utf8')
  .split(/\r?\n/u)
  .filter(Boolean);
const evidenceRoot = path.resolve(args.evidence);

validateShape(report);
if (report.checks.some((check) => ['passed', 'failed'].includes(check.status)))
  validateBrowserCommands(commands);

const expectedCriteria = acceptanceCriteria(metadata.task);
try {
  validateCoverage(report.checks, expectedCriteria);
} catch (error) {
  invalid(error.message);
}

let screenshotCount = 0;
for (const [index, check] of report.checks.entries()) {
  try {
    screenshotCount += validateCheck(check, index, evidenceRoot);
  } catch (error) {
    invalid(error.message);
  }
}

if (screenshotCount === 0 && report.checks.some((check) => ['passed', 'failed'].includes(check.status)))
  invalid('At least one browser screenshot is required.');

const { failures: semanticFailures, evidenceGaps } =
  applySemanticGuards(report);
{
  writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);
}
if (report !== rawReport) {
  console.log(
    'Normalized an equivalent Agent Browser report to the factory report schema.',
  );
}
for (const failure of semanticFailures) {
  console.error(`Agent Browser semantic guard failed: ${failure}`);
}

const failedChecks = report.checks.filter((check) => check.status === 'failed');
// Status derives from observed checks. A model's top-level passed=true cannot
// turn blocked/missing work green. A required blocked item never reaches repair.
const incomplete = report.checks.filter((check) =>
  check.status === 'blocked' || (check.status === 'not_run' &&
    !expectedCriteria.find((c) => c.id === check.id)?.optional),
);
if (failedChecks.length > 0) {
  report.passed = false;
  writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);
  console.error('Agent Browser acceptance failed:');
  for (const gap of evidenceGaps) console.error(`Incomplete QA evidence: ${gap}`);
  console.error(JSON.stringify(report, null, 2));
  process.exit(10);
}
if (incomplete.some((check) => check.status === 'blocked')) {
  report.passed = false;
  writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);
  console.error('Agent Browser acceptance blocked; no application repair was requested.');
  console.error(JSON.stringify(incomplete, null, 2));
  process.exit(20);
}
if (incomplete.length > 0) invalid('Required acceptance checks were not run: ' + incomplete.map((c) => c.id).join(', '));
if (evidenceGaps.length > 0) invalid(evidenceGaps.join('\n'));
if (!report.authenticated || report.failures.length > 0 || report.passed !== true)
  invalid('Report is incomplete or inconsistent; only observed failed checks authorize application repair.');
console.log(`Agent Browser acceptance passed with ${report.checks.length} check(s) and ${screenshotCount} screenshot(s).`);
process.exit(0);

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

function normalizeReport(value) {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.passed === 'boolean' &&
    typeof value.authenticated === 'boolean' &&
    Array.isArray(value.checks) &&
    Array.isArray(value.failures)
  ) {
    const checks = value.checks.map(normalizeCheck);
    const failures = value.failures.map((failure, index) => {
      const formatted = formatFailure(failure);
      if (!formatted) {
        invalid(`failures[${index}] must describe the failure.`);
      }
      return formatted;
    });
    const changed =
      checks.some((check, index) => check !== value.checks[index]) ||
      failures.some((failure, index) => failure !== value.failures[index]);
    return changed ? { ...value, checks, failures } : value;
  }

  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Array.isArray(value.criteria)
  ) {
    return value;
  }

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
      ...(criterion.id != null ? { id: criterion.id } : {}),
      criterion: String(criterion.name ?? '').trim(),
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

function normalizeCheck(check) {
  if (!check || typeof check !== 'object' || Array.isArray(check)) {
    return check;
  }

  const hasCanonicalShape =
    typeof check.criterion === 'string' &&
    check.criterion.trim() &&
    ['passed', 'failed', 'blocked', 'not_run'].includes(check.status) &&
    Array.isArray(check.actions) &&
    Array.isArray(check.evidence) &&
    Array.isArray(check.screenshots);
  if (hasCanonicalShape) return check;

  const rawStatus = String(check.status ?? check.result ?? '')
    .trim()
    .toLowerCase();
  const status = rawStatus.startsWith('pass')
    ? 'passed'
    : rawStatus.startsWith('fail')
      ? 'failed'
      : check.status;
  const details = printableFailureValue(check.details);
  const rawEvidence = Array.isArray(check.evidence) ? check.evidence : [];
  const evidenceIsScreenshots =
    rawEvidence.length > 0 &&
    rawEvidence.every(
      (item) =>
        typeof item === 'string' &&
        /^[A-Za-z0-9][A-Za-z0-9-]*\.png$/u.test(item),
    );
  const screenshots = Array.isArray(check.screenshots)
    ? check.screenshots
    : evidenceIsScreenshots
      ? rawEvidence
      : Array.isArray(check.images)
        ? check.images
        : undefined;
  const actions = Array.isArray(check.actions)
    ? check.actions
    : Array.isArray(check.steps)
      ? check.steps
      : details
        ? [details]
        : undefined;
  const evidence = evidenceIsScreenshots
    ? details
      ? [details]
      : undefined
    : rawEvidence.length > 0
      ? rawEvidence
      : details
        ? [details]
        : undefined;
  const criterion =
    String(check.criterion ?? check.name ?? '').trim() ||
    '';

  return {
    ...(check.id != null ? { id: check.id } : {}),
    ...(check.reason ? { reason: check.reason } : {}),
    criterion,
    status,
    actions,
    evidence,
    screenshots,
  };
}

function formatDefect(defect) {
  return formatFailure(defect);
}

function formatFailure(failure) {
  if (typeof failure === 'string') return failure.trim();
  if (!failure || typeof failure !== 'object' || Array.isArray(failure)) {
    return '';
  }

  const fields = [
    ['criterion', 'Criterion'],
    ['title', 'Failure'],
    ['description', 'Description'],
    ['message', 'Message'],
    ['repro', 'Reproduce'],
    ['reproduction', 'Reproduce'],
    ['steps', 'Steps'],
    ['observed', 'Observed'],
    ['actual', 'Observed'],
    ['expected', 'Expected'],
    ['impact', 'Impact'],
  ];
  const parts = [];
  const seen = new Set();
  for (const [key, label] of fields) {
    const text = printableFailureValue(failure[key]);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    parts.push(`${label}: ${text}`);
  }
  return parts.join(' ');
}

function printableFailureValue(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => printableFailureValue(item))
      .filter(Boolean)
      .join(' -> ');
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => {
        const text = printableFailureValue(item);
        return text ? `${key}: ${text}` : '';
      })
      .filter(Boolean)
      .join('; ');
  }
  return value == null ? '' : String(value).trim();
}

function applySemanticGuards(value) {
  const failures = [];
  const evidenceGaps = [];
  for (const check of value.checks) {
    if (check.status !== 'passed') continue;
    const observation = [...check.actions, ...check.evidence].join(' ');
    const reasons = [];

    if (
      /(?:提示|显示|出现|show(?:s|ed)?|display(?:s|ed)?)[^.!。]{0,80}something went wrong/i.test(
        observation,
      )
    ) {
      reasons.push('a required flow displayed “Something went wrong”');
    }

    if (
      /(?:编辑|\bedit(?:ing|ed)?\b)/iu.test(check.criterion) &&
      /(?:(?:opened|opens) with (?:empty|blank) required fields|required fields (?:were|are) (?:empty|blank)|(?:必填字段|已有值|原值)(?:均|都|全部|仍)?(?:为空|未回填|没有回填))/iu.test(
        observation,
      )
    ) {
      reasons.push('the edit form did not preserve existing required values');
    }

    if (
      /(?:编辑|\bedit(?:ing|ed)?\b)/iu.test(check.criterion) &&
      !/(?:预填|回填|原值|当前值|已有值|prefill|pre-fill|prepopulate|pre-populate|existing value|current value)/iu.test(
        observation,
      )
    ) {
      evidenceGaps.push(
        `${check.criterion}: the edit scenario did not verify existing values were prefilled. Verify the existing fields in the browser and document the observation and screenshot in this check; a delivery summary may cite the already verified edit scenario.`,
      );
    }

    if (reasons.length === 0) continue;
    check.status = 'failed';
    const failure = `${check.criterion}: ${reasons.join('; ')}.`;
    value.failures.push(failure);
    failures.push(failure);
  }

  if (failures.length > 0) value.passed = false;
  return { failures, evidenceGaps };
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
  if (report && typeof report === 'object') {
    report.passed = false;
    writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);
  }
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

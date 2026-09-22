import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { acceptanceCriteria, identifyCheck } from './acceptance-criteria.mjs';
import { validateCheck } from './browser-report-check.mjs';

// This writer validates structure and real PNG references, never manufactures observations.
const [action, input] = process.argv.slice(2);
const reportPath = process.env.FACTORY_BROWSER_REPORT;
const evidence = process.env.FACTORY_BROWSER_EVIDENCE_DIR;
if (
  !reportPath ||
  !evidence ||
  !input ||
  !['check', 'finish'].includes(action)
) {
  throw new Error(
    'Usage: node "$FACTORY_BROWSER_REPORT_TOOL" check <check.json> | finish <summary.json>',
  );
}
const value = JSON.parse(readFileSync(input, 'utf8'));
const draft = existsSync(reportPath)
  ? JSON.parse(readFileSync(reportPath, 'utf8'))
  : {
      passed: false,
      authenticated: false,
      summary: '验收进行中',
      checks: [],
      failures: [],
    };
if (action === 'check') {
  const metadata = JSON.parse(readFileSync(process.env.FACTORY_BROWSER_METADATA, 'utf8'));
  const criteria = acceptanceCriteria(metadata.task);
  const criterion = identifyCheck(value, criteria);
  value.id = criterion.id;
  value.criterion = criterion.text;
  validateCheck(value, draft.checks.length, path.resolve(evidence));
  const index = draft.checks.findIndex(
    (check) => identifyCheck(check, criteria).id === value.id,
  );
  if (index < 0) draft.checks.push(value);
  else draft.checks[index] = value;
  draft.passed = false;
} else {
  if (
    typeof value.passed !== 'boolean' ||
    typeof value.authenticated !== 'boolean' ||
    typeof value.summary !== 'string' ||
    !value.summary.trim() ||
    !Array.isArray(value.failures) ||
    value.failures.some((item) => typeof item !== 'string' || !item.trim())
  )
    throw new Error(
      'Summary requires passed, authenticated, summary and failures.',
    );
  Object.assign(draft, {
    passed: value.passed,
    authenticated: value.authenticated,
    summary: value.summary,
    failures: value.failures,
  });
}
const temp = `${reportPath}.tmp`;
writeFileSync(temp, `${JSON.stringify(draft, null, 2)}\n`);
renameSync(temp, reportPath);
if (action === 'finish') {
  const result = spawnSync(
    process.execPath,
    [
      path.join(import.meta.dirname, 'validate-browser-report.mjs'),
      '--metadata',
      process.env.FACTORY_BROWSER_METADATA,
      '--report',
      reportPath,
      '--commands',
      process.env.FACTORY_AGENT_BROWSER_COMMAND_LOG,
      '--evidence',
      evidence,
    ],
    { stdio: 'inherit' },
  );
  process.exit(result.status ?? 2);
}
console.log(
  'Check recorded; final acceptance still requires the full validator.',
);

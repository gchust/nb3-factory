import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { replaceTemplate } from './factory-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const template = readFileSync(args.template, 'utf8');
const originalPrompt = readFileSync(args.task, 'utf8');
// QA transcripts contain passing criteria and evaluator instructions. Never use
// that stream as implementation input; project only observed failing behavior.
const kind = args['failure-kind'] || 'build';
if (!['build', 'browser'].includes(kind))
  throw new Error('Invalid failure kind');
let feedback;
if (kind === 'browser') {
  if (!args.report || !args['application-log'])
    throw new Error('Browser feedback paths are required');
  if (existsSync(args.report)) {
    const report = JSON.parse(readFileSync(args.report, 'utf8'));
    if (!Array.isArray(report.checks)) throw new Error('Invalid QA report');
    const defects = report.checks
      .filter((check) => check.status === 'failed')
      .map((check) => ({
        actions: check.actions,
        observed: check.evidence,
      }));
    if (defects.length === 0)
      throw new Error('No observed failed checks to repair');
    feedback = JSON.stringify({ defects }, null, 2);
  } else {
    // Startup can fail before QA runs. The server log contains application
    // diagnostics, not the browser agent transcript or its prompt.
    feedback =
      'Application did not reach browser acceptance.\n' +
      (existsSync(args['application-log'])
        ? readFileSync(args['application-log'], 'utf8').slice(-60_000)
        : 'No application log was produced. Investigate application startup.');
  }
} else {
  feedback = readFileSync(args.log, 'utf8').slice(-60_000);
}

writeFileSync(
  args.output,
  replaceTemplate(template, {
    ORIGINAL_TASK: originalPrompt,
    VERIFY_LOG: feedback,
    // Same file the implementation round wrote: the repair round appends to it
    // instead of starting a second, partial retrospective.
    RETRO_PATH: retroPath(),
  }),
);

function retroPath(value) {
  return value?.trim() || '（本次未提供路径，跳过复盘）';
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    parsed[argv[index]?.replace(/^--/, '')] = argv[index + 1];
  }
  for (const name of ['template', 'task', 'log', 'output']) {
    if (!parsed[name]) throw new Error(`Missing --${name}`);
  }
  return parsed;
}

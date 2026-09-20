import { readFileSync, writeFileSync } from 'node:fs';

import { replaceTemplate } from './factory-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const template = readFileSync(args.template, 'utf8');
const originalPrompt = readFileSync(args.task, 'utf8');
const verificationLog = readFileSync(args.log, 'utf8');
const logTail = verificationLog.slice(-60_000);

writeFileSync(
  args.output,
  replaceTemplate(template, {
    ORIGINAL_TASK: originalPrompt,
    VERIFY_LOG: logTail,
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

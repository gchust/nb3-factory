import { readFileSync, writeFileSync } from 'node:fs';

import { renderAcceptance } from './acceptance-criteria.mjs';

import { replaceTemplate } from './factory-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const metadata = JSON.parse(readFileSync(args.metadata, 'utf8'));
const template = readFileSync(args.template, 'utf8');

writeFileSync(
  args.output,
  (metadata.task.qaScope === 'focused'
    ? '# 本轮仅复测上次失败路径，不制作额外展示素材。通过后工厂仍会完整验收。\n\n'
    : '') +
    replaceTemplate(template, {
      ISSUE_NUMBER: metadata.issue.number,
      ISSUE_TITLE: metadata.issue.title,
      TASK_TYPE: metadata.task.taskType,
      SAMPLE_DATA: metadata.task.sampleData,
      REQUIREMENTS: metadata.task.requirements,
      ACCEPTANCE_CRITERIA: renderAcceptance(metadata.task),
    }),
);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    parsed[argv[index]?.replace(/^--/, '')] = argv[index + 1];
  }
  for (const name of ['metadata', 'template', 'output']) {
    if (!parsed[name]) throw new Error(`Missing --${name}`);
  }
  return parsed;
}

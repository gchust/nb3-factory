import { readFileSync, writeFileSync } from 'node:fs';

import { replaceTemplate } from './factory-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const metadata = JSON.parse(readFileSync(args.metadata, 'utf8'));
const template = readFileSync(args.template, 'utf8');

const prompt = replaceTemplate(template, {
  ISSUE_NUMBER: metadata.issue.number,
  ISSUE_TITLE: metadata.issue.title,
  ISSUE_URL: metadata.issue.url,
  TARGET_BRANCH: metadata.task.targetBranch,
  TASK_TYPE: metadata.task.taskType,
  REQUIREMENTS: metadata.task.requirements,
  ACCEPTANCE_CRITERIA: metadata.task.acceptanceCriteria,
  SAMPLE_DATA: metadata.task.sampleData,
});

writeFileSync(args.output, prompt);

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

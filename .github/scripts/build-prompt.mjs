import { readFileSync, writeFileSync } from 'node:fs';

import { replaceTemplate } from './factory-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const metadata = JSON.parse(readFileSync(args.metadata, 'utf8'));
const template = readFileSync(args.template, 'utf8');

const prompt = replaceTemplate(template, {
  ISSUE_NUMBER: metadata.issue.number,
  ISSUE_TITLE: metadata.issue.title,
  TARGET_BRANCH: metadata.task.targetBranch,
  TASK_TYPE: metadata.task.taskType,
  REQUIREMENTS: metadata.task.requirements,
  SAMPLE_DATA: metadata.task.sampleData,
  // The agent writes its retrospective outside the application tree so it can
  // never end up in the business patch.
  RETRO_PATH: retroPath(),
});

if (/\{\{(?:ACCEPTANCE_CRITERIA|ISSUE_URL)\}\}/.test(prompt)) {
  throw new Error(
    'Implementation template must not request QA criteria or the full Issue URL.',
  );
}
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

function retroPath(value) {
  return value?.trim() || '（本次未提供路径，跳过复盘）';
}

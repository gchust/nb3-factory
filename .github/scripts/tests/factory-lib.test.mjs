import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TaskInputError,
  assertSafeChangedPaths,
  extractIssueSections,
  issueNumberFromEvent,
  parseIssueTask,
  validateTargetBranch,
} from '../factory-lib.mjs';

const validBody = `### 目标分支

apps/it-service-desk

### 任务类型

继续完善现有系统

### 业务需求

员工可以提交工单。

处理人员可以分派、解决工单。

### 验收要求

1. 员工可以查看进度
2. 服务台可以查看逾期

### 示例数据

是

### 确认

- [x] 我确认
`;

test('extractIssueSections keeps multiline field values', () => {
  const sections = extractIssueSections(validBody);
  assert.equal(sections.get('目标分支'), 'apps/it-service-desk');
  assert.match(sections.get('业务需求'), /员工可以提交工单。[\s\S]*处理人员/);
});

test('parseIssueTask normalizes the Issue Form body', () => {
  const task = parseIssueTask({ body: validBody });
  assert.deepEqual(task, {
    targetBranch: 'apps/it-service-desk',
    taskType: '继续完善现有系统',
    requirements: '员工可以提交工单。\n\n处理人员可以分派、解决工单。',
    acceptanceCriteria: '1. 员工可以查看进度\n2. 服务台可以查看逾期',
    sampleData: '是',
  });
});

test('parseIssueTask rejects missing required content', () => {
  assert.throws(
    () =>
      parseIssueTask({
        body: validBody.replace(
          '员工可以提交工单。\n\n处理人员可以分派、解决工单。',
          '_No response_',
        ),
      }),
    TaskInputError,
  );
});

test('parseIssueTask ignores the legacy repair count field', () => {
  const body = validBody.replace(
    '### 确认',
    '### 自动修复次数\n\n0 次\n\n### 确认',
  );
  assert.deepEqual(
    parseIssueTask({ body }),
    parseIssueTask({ body: validBody }),
  );
});

test('target branch validation accepts only apps namespace', () => {
  assert.equal(validateTargetBranch('apps/crm-v2'), 'apps/crm-v2');
  assert.equal(validateTargetBranch('apps/team/crm_2'), 'apps/team/crm_2');
  for (const invalid of [
    'main',
    'agent/issue-1',
    'apps/CRM',
    'apps/../main',
    'apps/a lock',
  ]) {
    assert.throws(() => validateTargetBranch(invalid), TaskInputError);
  }
});

test('issue number resolves from every supported trigger', () => {
  assert.equal(issueNumberFromEvent({ issue: { number: 12 } }), 12);
  assert.equal(
    issueNumberFromEvent({ client_payload: { issue_number: '13' } }),
    13,
  );
  assert.equal(issueNumberFromEvent({ inputs: { issue_number: 14 } }), 14);
  assert.throws(
    () => issueNumberFromEvent({ inputs: { issue_number: '../1' } }),
    TaskInputError,
  );
});

test('factory control files cannot be published from a Code Agent patch', () => {
  assert.doesNotThrow(() =>
    assertSafeChangedPaths(['client/pages/orders.tsx', 'pnpm-lock.yaml']),
  );
  for (const file of [
    '.github/workflows/code-agent-task.yml',
    '.npmrc',
    '.gitmodules',
    'config.yml',
  ]) {
    assert.throws(() => assertSafeChangedPaths([file]), TaskInputError);
  }
});

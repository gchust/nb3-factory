import { createHash } from 'node:crypto';

import { extractIssueSections, parseIssueTask, TaskInputError, validateTargetBranch } from './factory-lib.mjs';
import { listAll, parseBuild } from './comment-queue.mjs';
import { stripTaskTitle } from './task-compat.mjs';
import { splitPresetComments } from './preset-comment-inputs.mjs';

export const PRESET_LABEL = 'factory:preset';
export const PRESET_FORM_PATH = '.github/ISSUE_TEMPLATE/rebuild-from-preset.yml';
const readyPattern = /^<!-- factory-preset-ready:([a-f0-9]{64}) -->\r?\n/;
const snapshotPattern = /<!-- factory-preset-snapshot-v1:([a-f0-9]{64}):(\d+):(\d+)\n([A-Za-z0-9+/=]+)\n-->$/;

export function isPresetIssue(issue) {
  return issue.labels?.some((label) => (label.name ?? label) === PRESET_LABEL) ?? false;
}

function isHuman(user) {
  return Boolean(user?.login && user.type !== 'Bot' && !/\[bot\]$/i.test(user.login));
}

function isFactoryComment(comment) {
  return comment.user?.login === 'github-actions[bot]' && comment.user?.type === 'Bot';
}

function hashInput(text) {
  return createHash('sha256').update(text).digest('hex');
}

function chunks(text, size = 48000) {
  // Avoid splitting emoji/surrogate pairs when copying large Markdown comments.
  const characters = Array.from(text);
  const parts = [];
  for (let offset = 0; offset < characters.length; offset += size) {
    parts.push(characters.slice(offset, offset + size).join(''));
  }
  return parts.length ? parts : [''];
}

function sourceNumber(body) {
  const value = extractIssueSections(body).get('预置案例');
  if (value == null) return null;
  const number = Number(/^#(\d+)(?:\s|$)/.exec(value)?.[1]);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new TaskInputError('请选择有效的预置案例；没有案例时，先为原 Issue 添加 factory:preset 标签。');
  }
  return number;
}

function replaceSection(body, label, value) {
  const section = new RegExp(`^###\\s+${label}\\s*\\r?\\n[\\s\\S]*?(?=^###\\s+|(?![\\s\\S]))`, 'm');
  const replacement = `### ${label}\n\n${value}\n\n`;
  return section.test(body) ? body.replace(section, () => replacement) : replacement + body;
}

function clonedBody(snapshot, hash) {
  let body = snapshot.source.body.replace(readyPattern, '');
  // Old snapshots keep their original target; new cases pin the default branch.
  body = replaceSection(body, '目标分支', snapshot.targetBranch ?? `issues-${snapshot.issueNumber}`);
  body = replaceSection(body, '任务类型', '创建新系统');
  const extra = snapshot.extra
    ? `> **本次补充要求**\n${snapshot.extra.split('\n').map((line) => `> ${line}`).join('\n')}\n\n`
    : '';
  return `<!-- factory-preset-ready:${hash} -->\n` +
    `> 复制自[预置案例 #${snapshot.source.number}](${snapshot.source.url})。人工评论按原顺序复制；一次性搭建，不逐轮回放。\n\n` + extra + body;
}

// A complete, checksummed snapshot survives runner/artifact retention and source
// edits. Partial snapshot writes are never used to start a build. Chunking keeps
// large conversations below GitHub's per-comment limit without dropping input.
function readSnapshot(comments, issueNumber, expectedHash, selectedNumber) {
  const groups = new Map();
  for (const comment of comments.filter(isFactoryComment).sort((a, b) => a.id - b.id)) {
    const match = snapshotPattern.exec(comment.body ?? '');
    if (!match) continue;
    const [, hash, indexText, countText, part] = match;
    if (expectedHash && hash !== expectedHash) continue;
    const index = Number(indexText);
    const count = Number(countText);
    if (!Number.isSafeInteger(count) || count <= 0 || index < 0 || index >= count) continue;
    const group = groups.get(hash) ?? { count, parts: new Map() };
    if (group.count !== count) throw new TaskInputError('预置案例输入快照的分块数量不一致。');
    group.parts.set(index, part);
    groups.set(hash, group);
  }
  for (const [hash, { count, parts }] of groups) {
    if (parts.size !== count) continue;
    const encoded = Array.from({ length: count }, (_, index) => parts.get(index)).join('');
    const json = Buffer.from(encoded, 'base64').toString('utf8');
    if (hashInput(json) !== hash) throw new TaskInputError('预置案例输入快照校验失败。');
    const snapshot = JSON.parse(json);
    if (snapshot.version !== 1 || snapshot.issueNumber !== issueNumber) continue;
    if (selectedNumber && snapshot.source.number !== selectedNumber) continue;
    return { snapshot, hash };
  }
  if (expectedHash) throw new TaskInputError('本任务的预置输入快照缺失或不完整，不能改用来源 Issue 的最新内容。');
  return null;
}

async function captureSnapshot(client, issue, number, comments) {
  if (number === issue.number) throw new TaskInputError('不能从当前 Issue 复制自身。');
  const source = await client.getIssue(number);
  if (source.pull_request || !isPresetIssue(source) || !isHuman(source.user)) {
    throw new TaskInputError('来源必须是带 factory:preset 标签、由人工创建的 Issue。');
  }
  // Validate the business fields but do not inherit the source's old branch.
  const targetBranch = validateTargetBranch((await client.getRepository()).default_branch);
  const sourceBody = replaceSection(source.body ?? '', '目标分支', targetBranch);
  parseIssueTask({ ...source, body: sourceBody });
  const originals = await listAll(client, `/issues/${number}/comments`);
  const snapshot = {
    version: 1,
    issueNumber: issue.number,
    targetBranch,
    capturedAt: new Date().toISOString(),
    source: {
      number, title: source.title, body: source.body,
      author: source.user.login, url: source.html_url,
      updatedAt: source.updated_at,
    },
    extra: extractIssueSections(issue.body).get('本次补充要求') || '',
    comments: originals.filter((comment) => isHuman(comment.user))
      .sort((a, b) => a.id - b.id)
      .map((comment) => ({
        id: comment.id, author: comment.user.login,
        createdAt: comment.created_at, url: comment.html_url,
        body: comment.body ?? '',
      })),
  };
  const json = JSON.stringify(snapshot);
  const hash = hashInput(json);
  if (clonedBody(snapshot, hash).length > 65000) {
    throw new TaskInputError('原 Issue 正文加来源信息后超过 GitHub 长度限制，请先缩短原正文。人工评论不会截断。');
  }
  const parts = chunks(Buffer.from(json).toString('base64'));
  for (const [index, part] of parts.entries()) {
    comments.push(await client.addComment(issue.number,
      `预置案例 #${number} 输入快照 ${index + 1}/${parts.length}（由工厂读取，请勿删除）。\n\n` +
      `<!-- factory-preset-snapshot-v1:${hash}:${index}:${parts.length}\n${part}\n-->`));
  }
  return { snapshot, hash };
}

async function copyComments(client, issue, snapshot, hash, comments) {
  const markers = new Set(comments.filter(isFactoryComment).map((comment) =>
    /<!-- factory-preset-copy:[^\n]+ -->$/.exec(comment.body ?? '')?.[0]));
  for (const original of snapshot.comments) {
    const parts = chunks(original.body, 24000);
    for (const [index, part] of parts.entries()) {
      const marker = `<!-- factory-preset-copy:${hash}:${original.id}:${index} -->`;
      if (markers.has(marker)) continue;
      const reference = original.url || `${snapshot.source.url}#issuecomment-${original.id}`;
      await client.addComment(issue.number,
        `复制自[案例 #${snapshot.source.number} 的人工评论](${reference}) · 原作者：${original.author}` +
        ` · 原时间：${original.createdAt || '未知'}${parts.length > 1 ? ` · ${index + 1}/${parts.length}` : ''}\n\n` +
        `${part}\n\n${marker}`);
      markers.add(marker);
    }
  }
}

function addPresetInputs(task, snapshot) {
  const { business, reviews } = splitPresetComments(snapshot.comments);
  const history = business
    .map((comment) => `## 案例人工评论 #${comment.id}（${comment.author}）\n\n${parseBuild(comment.body) || comment.body}`);
  if (snapshot.extra) history.push(`## 本次补充要求\n\n${snapshot.extra}`);
  const additional = history.join('\n\n');
  const reviewCriteria = reviews.map((comment) =>
    `## 案例评审评论 #${comment.id}（${comment.author}）\n\n${comment.body}`).join('\n\n');
  return {
    ...task,
    // Reviewers inspect code; browser QA must not be asked to read source.
    ...(reviews.length ? { reviewCriteria } : {}),
    requirements: [task.requirements, additional].filter(Boolean).join('\n\n'),
    acceptanceCriteria: additional
      ? `${task.acceptanceCriteria}\n\n同时验证案例人工输入中的产品要求：\n\n${additional}`
      : task.acceptanceCriteria,
  };
}

export async function preparePresetIssue(client, issue) {
  const readyHash = readyPattern.exec(issue.body ?? '')?.[1];
  const number = readyHash ? null : sourceNumber(issue.body ?? '');
  if (!readyHash && !number) return { issue, task: parseIssueTask(issue) };
  const comments = await listAll(client, `/issues/${issue.number}/comments`);
  const { snapshot, hash } = readSnapshot(comments, issue.number, readyHash, number)
    ?? await captureSnapshot(client, issue, number, comments);
  await copyComments(client, issue, snapshot, hash, comments);
  if (!readyHash) {
    // Patch last: until all copies exist the short selection form is not a
    // valid business task, so the comment scheduler cannot overtake preparation.
    issue = await client.request('PATCH', `/issues/${issue.number}`, {
      body: {
        title: `[Code Agent] ${stripTaskTitle(snapshot.source.title)}（重搭 #${snapshot.source.number}）`.slice(0, 250),
        body: clonedBody(snapshot, hash),
      },
    });
  }
  const task = addPresetInputs(parseIssueTask(issue), snapshot);
  return {
    issue,
    task,
    preset: {
      sourceIssueNumber: snapshot.source.number,
      sourceIssueUrl: snapshot.source.url,
      capturedAt: snapshot.capturedAt,
      inputHash: hashInput(JSON.stringify({
        title: issue.title,
        taskType: task.taskType,
        requirements: task.requirements,
        acceptanceCriteria: task.acceptanceCriteria,
        sampleData: task.sampleData,
      })),
      humanCommentCount: snapshot.comments.length,
      ...(task.reviewCriteria ? {
        reviewHash: hashInput(task.reviewCriteria),
        reviewCommentCount: splitPresetComments(snapshot.comments).reviews.length,
      } : {}),
    },
  };
}

export function renderPresetForm(issues) {
  const options = issues.filter((issue) => !issue.pull_request && isPresetIssue(issue) && isHuman(issue.user))
    .sort((a, b) => a.number - b.number)
    .map((issue) => `#${issue.number} - ${issue.title.replace(/[\r\n]+/g, ' ')}`);
  if (!options.length) options.push('暂无预置案例（请先添加 factory:preset 标签）');
  return `# Generated by sync-issue-presets.mjs; maintain cases using the factory:preset label.
name: 从预置案例重新搭建
description: 复制预置 Issue 的正文和人工评论，在独立新分支从头搭建
title: '[Code Agent] 从预置案例重新搭建'
labels:
  - agent:pending
body:
  - type: markdown
    attributes:
      value: |
        提交后复制原案例的正文及全部人工评论，不复制机器人回复、PR 或旧运行状态。
        从当前默认分支（develop）开始，在 agent/issue-<新 Issue 编号> 上搭建，PR 指向默认分支；不继承来源案例的分支。
        列表由 factory:preset 标签维护，包含已关闭的预置案例。列表同步完成后请刷新创建页面。
  - type: dropdown
    id: preset_issue
    attributes:
      label: 预置案例
      options:
${options.map((option) => `        - ${JSON.stringify(option)}`).join('\n')}
    validations:
      required: true
  - type: textarea
    id: additional_requirements
    attributes:
      label: 本次补充要求
      description: 可选，仅用于本次搭建，不修改原案例。
    validations:
      required: false
  - type: checkboxes
    id: confirmation
    attributes:
      label: 确认
      options:
        - label: 我确认复制案例并由 Code Agent 创建新分支的 Pull Request。
          required: true
`;
}

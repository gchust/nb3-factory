// Queue receipts live in trusted bot comments, independently of runner/artifact
// retention. Only the serialized queue workflow may mutate these receipts.
import { parseIssueTask, TaskInputError } from './factory-lib.mjs';

const marker = '<!-- factory-build-v1\n';
export const runTitle = /^Factory issue #(\d+) build (\d+)(?:\s|$)/;
export function parseBuild(body) {
  return (
    /^\/build[\t ]*\r?\n([\s\S]*\S)\s*$/
      .exec(body?.trim() ?? '')?.[1]
      ?.trim() || null
  );
}
export function readReceipt(comment) {
  if (
    comment.user?.login !== 'github-actions[bot]' ||
    comment.user?.type !== 'Bot'
  )
    return null;
  const body = comment.body ?? '';
  const start = body.lastIndexOf(marker);
  if (start < 0) return null;
  try {
    const receipt = JSON.parse(
      body.slice(start + marker.length, body.indexOf('\n-->', start)),
    );
    if (
      !Number.isSafeInteger(receipt.id) ||
      receipt.id <= 0 ||
      !['queued', 'dispatched', 'done'].includes(receipt.status)
    )
      return null;
    return { ...receipt, receiptId: comment.id };
  } catch {
    return null;
  }
}
export function receiptBody(receipt) {
  const data = { ...receipt };
  delete data.receiptId;
  data.excerpt = String(data.excerpt ?? data.prompt ?? '').slice(0, 1500);
  delete data.prompt;
  delete data.task;
  const labels = {
    queued: '排队中',
    dispatched: '已调度 / 执行中',
    done: '本轮已结束',
  };
  const json = JSON.stringify(data)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e');
  const quote = data.excerpt
    .slice(0, 1500)
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  const text = `回复[原评论 #${data.id}](${data.url})\n\n${quote}\n\n${data.kind === 'reply' ? '问答' : '搭建'}指令 #${data.id}：${labels[data.status]}${data.conclusion ? `（${data.conclusion}）` : ''}。\n\n${data.runId ? `Actions run: ${data.runId}\n\n` : ''}后续指令继续使用本 Issue 的工作分支与 PR；失败轮次仅继承已保存到分支的成果。\n\n${marker}${json}\n-->`;
  if (text.length > 60000)
    throw new TaskInputError(
      '搭建指令与 Issue 正文过长，请缩短后重新发表评论。',
    );
  return text;
}
export async function listAll(client, route, query = {}, key) {
  const values = [];
  for (let page = 1; ; page++) {
    const result = await client.request('GET', route, {
      query: { ...query, per_page: 100, page },
    });
    const items = key ? result[key] : result;
    values.push(...items);
    if (items.length < 100) return values;
  }
}
export async function receiptsFor(client, issueNumber) {
  const comments = await listAll(client, `/issues/${issueNumber}/comments`);
  return {
    comments,
    receipts: comments
      .map(readReceipt)
      .filter(Boolean)
      .sort((a, b) => a.id - b.id),
  };
}
export async function saveReceipt(client, issueNumber, receipt) {
  const body = receiptBody(receipt);
  if (receipt.receiptId) {
    await client.request('PATCH', `/issues/comments/${receipt.receiptId}`, {
      body: { body },
    });
  } else {
    const comment = await client.addComment(issueNumber, body);
    receipt.receiptId = comment.id;
  }
}
// Only the live owner-authored Issue/comment is an input source. Queue excerpts
// are display hints, including for receipts written by the older snapshot code.
export function sourceComment(client, issueNumber, comments, id) {
  const comment = comments.find((item) => item.id === Number(id));
  if (
    !comment ||
    comment.user?.login !== client.repository.split('/')[0] ||
    comment.user?.type === 'Bot'
  ) {
    throw new TaskInputError('原评论已删除或作者不再符合执行条件。');
  }
  const buildPrompt = parseBuild(comment.body);
  const prompt = buildPrompt || comment.body?.trim();
  if (!prompt) throw new TaskInputError('原评论内容为空。');
  return {
    id: comment.id,
    kind: buildPrompt ? 'build' : 'reply',
    url: `https://github.com/${client.repository}/issues/${issueNumber}#issuecomment-${comment.id}`,
    prompt,
  };
}
export async function resolveBuildTask(client, issue, buildId) {
  const { comments, receipts } = await receiptsFor(client, issue.number);
  const current = receipts.find((item) => item.id === Number(buildId));
  if (!current || current.status !== 'dispatched')
    throw new TaskInputError('追加指令未入队或已经结束；不能重复执行。');
  const source = sourceComment(client, issue.number, comments, buildId);
  const task = parseIssueTask(issue);
  const previous = receipts.filter(
    (item) =>
      item.id < current.id &&
      item.status === 'done' &&
      !/^(rejected:|cancelled:)/.test(item.conclusion ?? ''),
  );
  const history = previous.flatMap((item) => {
    try {
      const value = sourceComment(client, issue.number, comments, item.id);
      return [
        `## 先前${value.kind === 'reply' ? '讨论' : '追加指令'} #${item.id}（当前评论文本，原执行结果：${item.conclusion}；不表示已按编辑后的内容重做）`,
        value.prompt,
      ];
    } catch (error) {
      if (!(error instanceof TaskInputError)) throw error;
      return [
        `## 先前评论 #${item.id} 已删除或不可用，以实际代码及已有回复为准。`,
      ];
    }
  });
  return {
    ...task,
    commentKind: source.kind,
    sourceComment: { id: source.id, url: source.url, prompt: source.prompt },
    requirements: [
      '## Issue 当前业务需求（背景与回归约束）',
      task.requirements,
      ...history,
      ...comments
        .filter(
          (comment) =>
            comment.user?.login === 'github-actions[bot]' &&
            comment.user?.type === 'Bot' &&
            previous.some((item) =>
              comment.body?.endsWith(
                `<!-- factory-comment-reply:${item.id} -->`,
              ),
            ),
        )
        .map(
          (comment) =>
            `## 先前 Agent 回复（可能基于旧版要求，不代表本轮修改指令）\n${comment.body}`,
        ),
      `## 本轮${source.kind === 'reply' ? '需要回答的评论' : '必须实现的追加指令'} #${source.id}`,
      source.prompt,
      '在已有工作分支上增量修改。先检查当前代码和上轮失败记录；以 Issue 和本轮评论的当前明确要求为准。',
    ].join('\n\n'),
    acceptanceCriteria:
      source.kind === 'build'
        ? `${task.acceptanceCriteria}\n\n同时逐条验证本轮追加指令及其验收要求：\n${source.prompt}`
        : task.acceptanceCriteria,
  };
}
export async function admitComments(client, issue, comments, receipts) {
  const owner = client.repository.split('/')[0];
  // Refresh queued display/type and cancel deleted inputs. Dispatched inputs
  // are read again by prepare; already completed entries are never replayed.
  for (const receipt of receipts.filter((item) => item.status === 'queued')) {
    const before = JSON.stringify(receipt);
    try {
      const source = sourceComment(client, issue.number, comments, receipt.id);
      receipt.kind = source.kind;
      receipt.excerpt = source.prompt.slice(0, 1500);
    } catch (error) {
      if (!(error instanceof TaskInputError)) throw error;
      receipt.status = 'done';
      receipt.conclusion = `cancelled: ${error.message}`;
    }
    delete receipt.prompt;
    delete receipt.task;
    if (JSON.stringify(receipt) !== before)
      await saveReceipt(client, issue.number, receipt);
  }
  for (const comment of comments.sort((a, b) => a.id - b.id)) {
    if (
      !comment.body?.trim() ||
      comment.user?.login !== owner ||
      comment.user?.type === 'Bot' ||
      receipts.some((item) => item.id === comment.id)
    )
      continue;
    const source = sourceComment(client, issue.number, comments, comment.id);
    const receipt = {
      id: source.id,
      kind: source.kind,
      url: source.url,
      excerpt: source.prompt.slice(0, 1500),
      status: 'queued',
    };
    await saveReceipt(client, issue.number, receipt);
    receipts.push(receipt);
  }
  receipts.sort((a, b) => a.id - b.id);
}

// The task workflow is serialized per Issue. Claims use separate, append-only
// comments so they cannot race with the scheduler's receipt updates.
export function claimedRuns(comments, buildId) {
  return comments
    .filter(
      (comment) =>
        comment.user?.login === 'github-actions[bot]' &&
        comment.user?.type === 'Bot',
    )
    .map(
      (comment) =>
        new RegExp(`<!-- factory-comment-claim:${buildId}:(\\d+) -->$`).exec(
          comment.body,
        )?.[1],
    )
    .filter(Boolean)
    .map(Number);
}
export async function claimComment(
  client,
  issueNumber,
  buildId,
  runId,
  previousRunId,
) {
  const { comments } = await receiptsFor(client, issueNumber);
  const claims = claimedRuns(comments, buildId);
  if (claims.includes(Number(runId)))
    return Number(runId) === Math.max(...claims); // only retry the latest attempt in the chain
  if (
    claims.length &&
    (!previousRunId || Number(previousRunId) !== Math.max(...claims))
  )
    return false;
  if (!Number.isSafeInteger(Number(runId)) || Number(runId) <= 0)
    throw new Error('Invalid claiming run ID');
  await client.addComment(
    issueNumber,
    `开始处理[原评论 #${buildId}](https://github.com/${client.repository}/issues/${issueNumber}#issuecomment-${buildId})：[查看本轮 Actions](https://github.com/${client.repository}/actions/runs/${runId})。\n\n<!-- factory-comment-claim:${buildId}:${runId} -->`,
  );
  return true;
}

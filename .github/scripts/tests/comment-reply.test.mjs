import assert from 'node:assert/strict';
import test from 'node:test';
import { publishReply, replyPrompt } from '../comment-reply.mjs';

const metadata = {
  issue: { number: 2, url: 'https://github.com/o/r/issues/2' },
  buildCommentId: 21,
  task: {
    commentKind: 'reply',
    requirements: 'Build orders',
    sourceComment: {
      id: 21,
      url: 'https://github.com/o/r/issues/2#issuecomment-21',
      prompt: 'Does it support\npermissions?',
    },
  },
};
test('reply prompt asks for code evidence and forbids application changes and publishing', () => {
  const text = replyPrompt(metadata, '/tmp', 'skipped');
  assert.match(text, /不要修改应用代码/);
  assert.match(text, /不得调用 GitHub API/);
  assert.match(text, /文件路径依据/);
  assert.match(text, /发布结果：skipped/);
  assert.match(text, /comment-reply.md/);
});
test('publisher links and quotes the exact source comment and deduplicates retries', async () => {
  const comments = [];
  const client = {
    request: async () => comments,
    addComment: async (number, body) => {
      assert.equal(number, 2);
      comments.push({
        body,
        user: { login: 'github-actions[bot]', type: 'Bot' },
      });
    },
  };
  await publishReply(client, metadata, 'Yes; see server/routes/orders.ts.');
  await publishReply(client, metadata, 'Duplicate');
  assert.equal(comments.length, 1);
  assert.match(comments[0].body, /#issuecomment-21/);
  assert.match(comments[0].body, /> Does it support\n> permissions\?/);
  assert.match(comments[0].body, /server\/routes\/orders.ts/);
  await assert.rejects(publishReply(client, metadata, '   '));
});

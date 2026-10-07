import assert from 'node:assert/strict';
import test from 'node:test';
import { bindReplay } from '../replay-build-review.mjs';

const sha = 'a'.repeat(40);
const artifact = {
  id: 42,
  name: 'factory-agent-224',
  created_at: '2026-09-23T10:04:00Z',
  workflow_run: { id: 100, head_sha: sha },
};
const selected = {
  repository: 'owner/factory',
  issue: 224,
  runId: 100,
  attempt: 1,
  controlSha: sha,
  artifact,
};
const metadata = {
  repository: 'owner/factory',
  issue: { number: 224 },
  run: { id: 100, attempt: 1 },
  controlSha: sha,
  applicationBase: { sha },
};
const agent = (
  conclusion,
  window = ['2026-09-23T10:00:00Z', '2026-09-23T10:05:00Z'],
) => [
  { name: 'agent', conclusion, started_at: window[0], completed_at: window[1] },
];

test('a failed or timed-out task can have its sealed build review replayed', () => {
  for (const conclusion of ['success', 'failure', 'cancelled'])
    assert.equal(
      bindReplay(
        selected,
        metadata,
        null,
        Buffer.from('patch'),
        agent(conclusion),
      ).artifactId,
      42,
      conclusion,
    );
});

test('the artifact must still come from inside an agent job that ran', () => {
  for (const conclusion of ['skipped', null])
    assert.throws(
      () =>
        bindReplay(
          selected,
          metadata,
          null,
          Buffer.from('patch'),
          agent(conclusion),
        ),
      /claimed source job/,
    );
  assert.throws(
    () =>
      bindReplay(
        selected,
        metadata,
        null,
        Buffer.from('patch'),
        agent('failure', ['2026-09-23T10:05:00Z', '2026-09-23T10:09:00Z']),
      ),
    /claimed source job/,
  );
});

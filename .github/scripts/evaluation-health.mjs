// Health of the measurement pipeline, independent from application delivery.
// A measured failure is a complete evaluation; missing evidence is not.
import { appendFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function coverageHealth({ qa, requiredChecks, review }) {
  const measured = ['passed', 'failed'];
  return {
    status:
      measured.includes(qa) &&
      requiredChecks.results.every((r) => measured.includes(r.status)) &&
      ['completed', 'disabled'].includes(review)
        ? 'complete'
        : 'incomplete',
    qa,
    requiredChecks,
    review,
  };
}
export function healthSnapshot(
  document,
  { registered = false, delivery = 'disabled' } = {},
) {
  const coverage = document?.health ?? null;
  const broken =
    !coverage ||
    coverage.status !== 'complete' ||
    !registered ||
    !['disabled', 'pending', 'stored'].includes(delivery);
  return {
    status: broken
      ? 'incomplete'
      : delivery === 'pending'
        ? 'pending-delivery'
        : 'complete',
    applicationDelivery: document?.outcome?.delivery ?? 'unknown',
    coverage: coverage?.status ?? 'unknown',
    review: coverage?.review ?? 'unknown',
    registration: registered ? 'registered' : 'missing',
    delivery,
  };
}
export function renderHealth(value) {
  return [
    '## 评测链健康状态：' + value.status,
    '',
    '| 检查项 | 状态 |',
    '| --- | --- |',
    '| 应用交付（独立） | ' + value.applicationDelivery + ' |',
    '| 验收证据完整性 | ' + value.coverage + ' |',
    '| 框架评审 | ' + value.review + ' |',
    '| 报告登记 | ' + value.registration + ' |',
    '| 结果投递 | ' + value.delivery + ' |',
    '',
    'pending 表示等待接收回执，不能解释为已送达。缺失评审可用 Replay build review 补跑，无需重新搭建；不会自动重试付费评审。',
    '',
  ].join('\n');
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [file] = process.argv.slice(2);
  let document = null,
    registered = false,
    delivery = 'disabled';
  try {
    document = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    /* Missing export is visible below. */
  }
  if (document) {
    const { GitHubClient, parseBoolean } = await import('./factory-lib.mjs');
    const { readSubject, readOutbox, readBytes, revisionDir } =
      await import('./evaluation-registry.mjs');
    const client = new GitHubClient({
      token: process.env.GITHUB_TOKEN,
      repository: process.env.GITHUB_REPOSITORY,
      apiUrl: process.env.GITHUB_API_URL,
    });
    const key = document.run.key;
    const index = await readSubject(
      client,
      'evaluation-report',
      key,
      'gh-pages',
    );
    const entry = index?.revisions.find(
      (r) => r.revision === Number(process.env.EVALUATION_REVISION),
    );
    if (entry) {
      const bytes = await readBytes(
        client,
        revisionDir(key, entry.revision) + '/evaluation.json',
        'gh-pages',
      );
      registered = Boolean(
        bytes &&
        createHash('sha256').update(bytes).digest('hex') ===
          entry.evaluationSha256,
      );
      // Registration can carry forward a newer completed reassessment. Inspect
      // those exact registered bytes instead of the earlier export draft.
      if (registered) document = JSON.parse(bytes.toString('utf8'));
    }
    if (parseBoolean(process.env.FACTORY_EVALUATION_DELIVERY)) {
      const { deliveryConfig } = await import('./evaluation-target.mjs');
      try {
        const target = deliveryConfig(process.env, {
          requireToken: false,
        }).targetId;
        const { outbox } = await readOutbox(client);
        const receipt = outbox.entries.find(
          (e) =>
            e.targetId === target &&
            e.type === 'evaluation-report' &&
            e.key === key &&
            e.revision === entry?.revision,
        );
        delivery =
          receipt?.state === 'stored' && !receipt.receipt
            ? 'missing-receipt'
            : (receipt?.state ?? 'missing');
      } catch {
        delivery = 'configuration-error';
      }
    }
  }
  const health = healthSnapshot(document, { registered, delivery });
  const text = renderHealth(health);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  if (health.status === 'incomplete') process.exitCode = 1;
}

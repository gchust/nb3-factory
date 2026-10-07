import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const workflows = path.resolve(import.meta.dirname, '../../workflows');
const read = (name) => readFileSync(path.join(workflows, name), 'utf8');
const steps = (source) => source.split(/\n\s+- (?=name:|uses:|id:)/);

test('same-run artifacts are passed by ID, so "Re-run failed jobs" finds them', () => {
  // github.run_attempt names the new attempt, while a job that is not re-run
  // keeps the artifact its first attempt uploaded.
  for (const name of [
    'independent-review.yml',
    'deliver-evaluation.yml',
    'replay-build-review.yml',
  ]) {
    const source = read(name);
    const downloads = steps(source).filter((step) =>
      step.includes('actions/download-artifact@'),
    );
    assert.ok(downloads.length > 0, name);
    for (const step of downloads) {
      const label = `${name}: ${step.split('\n')[0]}`;
      assert.doesNotMatch(step, /run_attempt/, label);
      assert.match(step, /artifact-ids: \$\{\{ \S+ \}\}/, label);
    }
    // Every exported upload ID comes from an upload step with that id.
    const exported = [
      ...source.matchAll(
        /: \$\{\{ steps\.([\w-]+)\.outputs\.artifact-id \}\}/g,
      ),
    ].map(([, id]) => id);
    assert.ok(exported.length > 0, name);
    for (const id of exported) {
      const step = steps(source).find((body) => body.includes(`id: ${id}\n`));
      assert.ok(step, `${name}: ${id}`);
      assert.match(step, /actions\/upload-artifact@/, `${name}: ${id}`);
    }
  }
});

test('an empty artifact ID never reaches a download, which would fetch every artifact', () => {
  const guarded = {
    'independent-review.yml': [
      "needs.prepare.outputs.input_artifact != ''",
      "needs.review.outputs.review_artifact != ''",
    ],
    'deliver-evaluation.yml': [
      "needs.classify.outputs.classification_artifact != ''",
      "needs.send.outputs.results_artifact != ''",
    ],
    'replay-build-review.yml': ["needs.prepare.outputs.input_artifact != ''"],
  };
  for (const [name, conditions] of Object.entries(guarded)) {
    const source = read(name);
    for (const condition of conditions)
      assert.ok(source.includes(condition), `${name}: ${condition}`);
  }
});

test('preview transfers fail a step on a stall instead of running into the job limit', () => {
  const deploy = read('deploy-preview.yml');
  const teardown = read('preview-teardown.yml');
  for (const step of [
    'Publish the payload for the host to fetch',
    'Deploy the preview',
  ]) {
    const body = deploy.split(`- name: ${step}\n`)[1].split(/\n {6}- /)[0];
    const minutes = Number(/timeout-minutes: (\d+)/.exec(body)?.[1]);
    // Well inside the job's own limit, so the report step still runs.
    const job = Number(
      /\n {2}deploy-preview:\n[\s\S]*?\n {4}timeout-minutes: (\d+)/.exec(deploy)?.[1],
    );
    assert.ok(minutes > 0 && minutes + 15 <= job, step);
  }
  for (const [name, source] of [
    ['deploy-preview.yml', deploy],
    ['preview-teardown.yml', teardown],
  ]) {
    const lines = source
      .split('\n')
      .filter((text) => /-o ConnectTimeout=/.test(text));
    assert.ok(lines.length > 0, name);
    for (const line of lines)
      assert.match(
        line,
        /ServerAliveInterval=\d+ -o ServerAliveCountMax=\d+/,
        `${name}: ${line.trim()}`,
      );
  }
  // The host script that fetches the payload treats a crawl as a failure.
  const lib = readFileSync(
    path.resolve(import.meta.dirname, '../preview/preview-lib.sh'),
    'utf8',
  );
  assert.match(lib, /curl_opts=\([^)]*--speed-limit \d+ --speed-time \d+/);
});

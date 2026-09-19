import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const read = (name) =>
  readFileSync(
    path.resolve(import.meta.dirname, '..', '..', 'workflows', name),
    'utf8',
  );

const deploy = read('deploy-preview.yml');
const teardown = read('preview-teardown.yml');
const task = read('code-agent-task.yml');

test('the preview deploy follows a completed task run and can be replayed', () => {
  assert.match(
    deploy,
    /workflow_run:\n\s+workflows: \[Code Agent NocoBase Task\]\n\s+types: \[completed\]/,
  );
  assert.match(deploy, /workflow_dispatch:/);
  assert.match(deploy, /--status/);
});

test('the preview deploy never builds or runs application code on the runner', () => {
  // The artifact is produced by verify-final and is data here. A deploy job
  // that built or executed it would be running unverified code in CI.
  assert.doesNotMatch(deploy, /pnpm|npm install|npm ci|node \.\/dist/);
});

test('the preview deploy trusts neither the run head nor the pull request head', () => {
  // The deployed commit is the pull request head that matchesTaskPR has already
  // tied to the agent-head-sha marker; taking either of these instead would let
  // a mutated ref decide what gets deployed.
  assert.doesNotMatch(deploy, /workflow_run\.head_sha/);
  assert.doesNotMatch(deploy, /pull_request\.head\.sha/);
  assert.match(deploy, /--sha '\$SHA'/);
});

test('the preview deploy checks out only the default branch', () => {
  assert.match(
    deploy,
    /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/,
  );
  assert.match(deploy, /persist-credentials: false/);
  assert.doesNotMatch(deploy, /ref: \$\{\{ github\.event\.workflow_run\.head/);
});

test('a failed preview does not fail the pipeline and is reported, not hidden', () => {
  const publish = deploy.slice(
    deploy.indexOf('Report the preview on the pull request'),
  );
  assert.match(publish, /continue-on-error: true/);
  assert.match(publish, /--status "[^"]*success[^"]*failed[^"]*"/);
});

test('the preview deploy stays inert without credentials', () => {
  assert.match(deploy, /PREVIEW_ENABLED:/);
  assert.match(deploy, /secrets\.FACTORY_PREVIEW_SSH_KEY != ''/);
  assert.match(deploy, /PREVIEW SKIPPED/);
});

test('preview teardown runs on pull_request_target, not pull_request', () => {
  // Only pull_request_target has secrets for a fork-originated pull request.
  assert.match(teardown, /pull_request_target:\n\s+types: \[closed\]/);
  assert.doesNotMatch(teardown, /^\s{2}pull_request:/m);
  assert.match(
    teardown,
    /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/,
  );
});

test('preview teardown runs no application code', () => {
  assert.doesNotMatch(teardown, /pnpm|npm install|npm ci/);
  assert.doesNotMatch(teardown, /persist-credentials: true/);
});

test('preview workflows keep every run step a block scalar', () => {
  // An inline `run:` scalar containing ": " is parsed as a nested mapping, and
  // the workflow is rejected before it ever runs — which is a mistake that
  // reads as correct in review. Every command here is written as a block.
  for (const [name, workflow] of [
    ['deploy-preview.yml', deploy],
    ['preview-teardown.yml', teardown],
  ]) {
    assert.doesNotMatch(
      workflow,
      /^[ \t]+run: (?![|])/m,
      `${name} has an inline run step; use a block scalar`,
    );
  }
});

test('the deployable build is produced by independent verification', () => {
  const verified = task.indexOf('Independently verify the applied patch');
  const packed = task.indexOf('Pack the deployable build for the preview host');
  const uploaded = task.indexOf(
    'factory-dist-${{ needs.prepare.outputs.issue_number }}',
  );
  assert.ok(verified > 0, 'verification step not found');
  assert.ok(packed > verified, 'the build must be packed after verification');
  assert.ok(uploaded > packed, 'the build must be uploaded after it is packed');
  // Stated explicitly: without a target the build records the runner itself and
  // ships native modules for whatever architecture the runner happens to be.
  assert.match(task, /pnpm build --tar --target linux-x64/);
});

test('the payload is published for the host to fetch, not pushed to it', () => {
  // Pushing these bytes over Tailscale measured 17 KB/s; the same file fetched
  // by the host over its own egress measured 815 KB/s. So the SSH channel must
  // carry a URL and a digest, and never the payload itself.
  assert.doesNotMatch(deploy, /scp[^\n]*payload/);
  assert.match(deploy, /asset="preview-pr-\$PR\.tar\.gz"/);
  // The file is named before the upload: an asset takes its name from the file
  // it was uploaded from, and `gh release upload <file>#<name>` does not rename
  // it — a run that relied on that published `payload.tar.gz` and the host then
  // fetched a URL that 404'd.
  assert.match(
    deploy,
    /cp "\$RUNNER_TEMP\/payload\.tar\.gz" "\$RUNNER_TEMP\/\$asset"/,
  );
  assert.match(
    deploy,
    /gh release upload "\$PREVIEW_RELEASE" --repo "\$GITHUB_REPOSITORY" --clobber \\\n\s+"\$RUNNER_TEMP\/\$asset"/,
  );
  assert.doesNotMatch(deploy, /#\$asset/);
  assert.match(deploy, /--payload-url '\$asset_url'/);
  assert.match(
    deploy,
    /--payload-sha256 '\$\{\{ steps\.publish\.outputs\.payload_sha256 \}\}'/,
  );
  assert.match(deploy, /--fetch-proxy '\$PREVIEW_FETCH_PROXY'/);
  // The digest describes the file that was uploaded, computed in that same step.
  assert.match(deploy, /payload_sha256=\$\(sha256sum/);
  // And the URL the host is told to fetch is the asset that was just uploaded.
  assert.match(
    deploy,
    /asset_url="https:\/\/github\.com\/\$GITHUB_REPOSITORY\/releases\/download\/\$PREVIEW_RELEASE\/preview-pr-\$PR\.tar\.gz"/,
  );
});

test('publishing the payload is the only write the preview deploy needs', () => {
  // Scoped to release assets: the workflow never writes to a branch.
  assert.match(deploy, /contents: write/);
  assert.doesNotMatch(deploy, /git push|gh pr merge|gh api .*PUT/);
});

test('the steps that call gh are given a token', () => {
  // `gh` does not pick the workflow token up on its own, and the failure is at
  // run time: the upload fails with "authentication required" after the build
  // has already been downloaded and unpacked.
  const publishStep = deploy.slice(
    deploy.indexOf('Publish the payload for the host to fetch'),
    deploy.indexOf('Deploy the preview'),
  );
  assert.match(publishStep, /gh release upload/);
  assert.match(publishStep, /GH_TOKEN: \$\{\{ github\.token \}\}/);

  const deleteStep = teardown.slice(
    teardown.indexOf('Delete the temporary payload'),
  );
  assert.match(deleteStep, /gh release delete-asset/);
  assert.match(deleteStep, /GH_TOKEN: \$\{\{ github\.token \}\}/);
});

test('the temporary payload is deleted when the pull request closes', () => {
  // It is public while it exists, so it must not outlive the preview.
  assert.match(
    teardown,
    /gh release delete-asset "\$PREVIEW_RELEASE" "preview-pr-\$PR\.tar\.gz"/,
  );
  assert.match(teardown, /PREVIEW_RELEASE: factory-previews/);
  assert.match(teardown, /contents: write/);
});

test('the deployable artifact carries the task metadata the preview reads from it', () => {
  const staged = task.indexOf('Stage the deployable build and its metadata');
  const uploaded = task.indexOf(
    'factory-dist-${{ needs.prepare.outputs.issue_number }}',
  );
  assert.ok(staged > 0, 'the preview payload is not staged');
  assert.ok(
    uploaded > staged,
    'the payload must be staged before it is uploaded',
  );
  const stage = task.slice(staged, uploaded);
  assert.match(
    stage,
    /cp workspace\/storage\/exports\/dist\.tar\.gz "\$RUNNER_TEMP\/deployable\/dist\.tar\.gz"/,
  );
  assert.match(
    stage,
    /cp agent-artifacts\/task-metadata\.json "\$RUNNER_TEMP\/deployable\/task-metadata\.json"/,
  );
  // Uploaded as one directory rather than as two paths where they lie:
  // `upload-artifact` keeps the structure below the paths' common ancestor, so
  // listing `workspace/storage/exports/dist.tar.gz` and `agent-artifacts/task-metadata.json`
  // together would nest each under its own directory and the download would stop
  // being flat.
  assert.match(task, /path: \$\{\{ runner\.temp \}\}\/deployable/);
  // Flat at the artifact root is what the preview reads.
  assert.match(
    readFileSync(
      path.resolve(import.meta.dirname, '..', 'deploy-preview.mjs'),
      'utf8',
    ),
    /readJson\(args\.artifacts, 'task-metadata\.json'\)/,
  );
});

// Run the workflow's actual staging commands so a producer/consumer directory
// mismatch fails locally, without rebuilding the application or deploying it.
test('deployable staging reads the exported archive and preserves the flat artifact layout', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'factory-stage-'));
  try {
    const stage = task.match(
      /- name: Stage the deployable build and its metadata\n\s+run: \|\n([\s\S]*?)\n {6}- name:/,
    );
    assert.ok(stage, 'missing deployment staging commands');
    const script = stage[1].replace(/^ {10}/gm, '');
    mkdirSync(path.join(root, 'workspace/storage/exports'), {
      recursive: true,
    });
    mkdirSync(path.join(root, 'agent-artifacts'));
    writeFileSync(
      path.join(root, 'workspace/storage/exports/dist.tar.gz'),
      'current build',
    );
    // An old artifact must never win over the build just exported.
    writeFileSync(
      path.join(root, 'workspace/storage/dist.tar.gz'),
      'stale build',
    );
    writeFileSync(
      path.join(root, 'agent-artifacts/task-metadata.json'),
      '{"issueNumber":111}',
    );
    const run = () =>
      spawnSync('bash', ['-e', '-c', script], {
        cwd: root,
        env: { ...process.env, RUNNER_TEMP: path.join(root, 'runner-temp') },
        encoding: 'utf8',
      });
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFileSync(
        path.join(root, 'runner-temp/deployable/dist.tar.gz'),
        'utf8',
      ),
      'current build',
    );
    assert.equal(
      readFileSync(
        path.join(root, 'runner-temp/deployable/task-metadata.json'),
        'utf8',
      ),
      '{"issueNumber":111}',
    );

    rmSync(path.join(root, 'workspace/storage/exports/dist.tar.gz'));
    const missing = run();
    assert.notEqual(
      missing.status,
      0,
      'missing current build must fail even if a legacy archive exists',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('preview connection is checked and public HTTPS gates the success report', () => {
  for (const workflow of [deploy, teardown]) {
    assert.doesNotMatch(workflow, /\n\s+targets:/);
    assert.doesNotMatch(workflow, /\n\s+ping:/);
    assert.match(workflow, /args: --accept-dns=false/);
    assert.match(
      workflow,
      /bash control\/\.github\/scripts\/preview-connect.sh/,
    );
  }
  assert.match(
    deploy,
    /node control\/\.github\/scripts\/preview-public-check.mjs/,
  );
  assert.match(deploy, /--status "\$\{\{ steps.public.outcome == 'success'/);
});

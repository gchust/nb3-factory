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
  // All three credentials the tailnet join and the SSH session need. Checking
  // only two of them let a deploy start, join the tailnet without a secret and
  // fail there instead of skipping.
  const enabled =
    "PREVIEW_ENABLED: ${{ secrets.FACTORY_PREVIEW_SSH_KEY != '' && secrets.FACTORY_TAILSCALE_OAUTH_CLIENT_ID != '' && secrets.FACTORY_TAILSCALE_OAUTH_CLIENT_SECRET != '' }}";
  assert.ok(deploy.includes(enabled), 'deploy-preview.yml');
  assert.ok(teardown.includes(enabled), 'preview-teardown.yml');
  assert.match(
    deploy,
    /PREVIEW SKIPPED: set FACTORY_PREVIEW_SSH_KEY, FACTORY_TAILSCALE_OAUTH_CLIENT_ID and FACTORY_TAILSCALE_OAUTH_CLIENT_SECRET/,
  );
});

test('the preview is reported after a failed deploy, not after a manual cancel', () => {
  assert.match(
    deploy,
    /- name: Report the preview on the pull request\n\s+if: \$\{\{ !cancelled\(\) && steps\.prepare\.outputs\.ready == 'true' && env\.PREVIEW_ENABLED == 'true' \}\}/,
  );
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
  const finalJob = task.slice(
    task.indexOf('\n  verify-final:\n'),
    task.indexOf('\n  publish:\n'),
  );
  const verified = finalJob.indexOf('Independently verify the applied patch');
  const staged = finalJob.indexOf(
    'Stage the deployable build and its metadata',
  );
  const uploaded = finalJob.indexOf(
    'factory-dist-${{ needs.prepare.outputs.issue_number }}',
  );
  assert.ok(verified > 0, 'verification step not found');
  assert.ok(staged > verified, 'the build must be staged after verification');
  assert.ok(uploaded > staged, 'the build must be uploaded after it is staged');
  // Stated explicitly: without a target the build records the runner itself and
  // ships native modules for whatever architecture the runner happens to be.
  assert.match(finalJob, /FACTORY_BUILD_TARGET: linux-x64/);
  // The verification build archives itself; only the final job asks for it,
  // and nothing runs a second build or an application-local pack script.
  assert.match(finalJob, /FACTORY_BUILD_ARCHIVE: '1'/);
  assert.equal(finalJob.match(/FACTORY_BUILD_ARCHIVE/g).length, 1);
  assert.doesNotMatch(finalJob, /pnpm build --tar|pack-dist/);
});

test('the payload is published for the host to fetch, not pushed to it', () => {
  // Pushing these bytes over Tailscale measured 17 KB/s; the same file fetched
  // by the host over its own egress measured 815 KB/s. So the SSH channel must
  // carry a URL and a digest, and never the payload itself.
  assert.doesNotMatch(deploy, /scp[^\n]*payload/);
  // The name carries the payload's digest, so one name always means one set of
  // bytes. One name per pull request, replaced with `--clobber`, is what let a
  // fetch be answered with the bytes the name carried before the replacement:
  // the digest check then refused a payload that had in fact been published, and
  // a live preview was reported as a failed deployment (PR #159, 2026-09-21).
  assert.match(
    deploy,
    /digest="\$\(sha256sum "\$RUNNER_TEMP\/payload\.tar\.gz" \| cut -d' ' -f1\)"/,
  );
  assert.match(deploy, /asset="preview-pr-\$PR-\$\{digest:0:16\}\.tar\.gz"/);
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
  // The digest describes the file that was uploaded, computed in that same step,
  // and it is the digest and the name the host is given.
  assert.match(deploy, /echo "payload_sha256=\$digest" >> "\$GITHUB_OUTPUT"/);
  assert.match(deploy, /echo "payload_asset=\$asset" >> "\$GITHUB_OUTPUT"/);
  assert.match(
    deploy,
    /asset_url="https:\/\/github\.com\/\$GITHUB_REPOSITORY\/releases\/download\/\$PREVIEW_RELEASE\/\$\{\{ steps\.publish\.outputs\.payload_asset \}\}"/,
  );
});

test('one build deployed twice does not replace the running preview', () => {
  // The task workflow dispatches this workflow for a delivered build and GitHub
  // also raises `workflow_run` for the same completed run, so the same commit is
  // requested twice. Replacing the instance would initialize a fresh disposable
  // dataset under whoever was using the preview, so the duplicate is recognized
  // by the host and only a deliberate replay may override that.
  assert.match(deploy, /--redeploy/);
  assert.match(deploy, /PREVIEW_FORCE: \$\{\{ inputs\.force \|\| 'false' \}\}/);
  assert.match(
    deploy,
    /if \[\[ "\$\{PREVIEW_FORCE:-false\}" == 'true' \]\]; then redeploy="--redeploy"; fi/,
  );
  assert.match(
    deploy,
    /force:\n\s+description: Replace a running preview even when it already serves this commit\n\s+required: false\n\s+default: false\n\s+type: boolean/,
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
    teardown.indexOf('Delete the temporary payloads'),
  );
  assert.match(deleteStep, /delete-preview-payloads\.sh "\$PR"/);
  assert.match(deleteStep, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  const capacityStep = deploy.slice(
    deploy.indexOf('Make room on the preview host'),
    deploy.indexOf('Publish the payload for the host to fetch'),
  );
  assert.match(capacityStep, /delete-preview-payloads\.sh "\$victim"/);
  assert.match(capacityStep, /GH_TOKEN: \$\{\{ github\.token \}\}/);
});

const deletePayloads = readFileSync(
  path.resolve(import.meta.dirname, '..', 'delete-preview-payloads.sh'),
  'utf8',
);

test('the temporary payloads are deleted when the pull request closes or its preview is evicted', () => {
  // They are public while they exist, so they must not outlive the preview. A
  // pull request that was deployed more than once left more than one of them.
  assert.match(deletePayloads, /mapfile -t assets < </);
  assert.ok(deletePayloads.includes("--json assets --jq '.assets[].name'"));
  assert.ok(
    deletePayloads.includes(
      'grep -E "^preview-pr-$pr(-[0-9a-f]{16})?\\.tar\\.gz$"',
    ),
  );
  assert.ok(
    deletePayloads.includes(
      'gh release delete-asset "$PREVIEW_RELEASE" "$asset"',
    ),
  );
  assert.match(teardown, /PREVIEW_RELEASE: factory-previews/);
  assert.match(deploy, /PREVIEW_RELEASE: factory-previews/);
  assert.match(teardown, /contents: write/);
  // An eviction already removed the preview; a failed asset deletion warns.
  assert.match(
    deploy,
    /delete-preview-payloads\.sh "\$victim" <\/dev\/null \|\|\n\s+echo "::warning::/,
  );
  // Nothing in the eviction loop may read the rest of the list from stdin.
  const loop = deploy.split('while read -r victim reason; do')[1].split('done < ')[0];
  assert.match(loop, /ssh -n /);
  assert.match(loop, /--pr "\$victim" --reason "\$reason" <\/dev\/null \|\|/);
});

test('deleting payloads removes only this pull request\'s assets', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'preview-payloads-'));
  try {
    const bin = path.join(root, 'bin');
    mkdirSync(bin);
    const log = path.join(root, 'gh.log');
    writeFileSync(
      path.join(bin, 'gh'),
      `#!/usr/bin/env bash
echo "$*" >> ${JSON.stringify(log)}
# Whatever a gh call reads from stdin would be lost from the eviction list.
cat >> ${JSON.stringify(path.join(root, 'stdin.log'))}
if [[ "$1 $2" == 'release view' ]]; then
  case "\${GH_RELEASE:-}" in
    missing) echo 'release not found' >&2; exit 1 ;;
    down) echo 'HTTP 502: Bad Gateway' >&2; exit 1 ;;
  esac
  printf '%s\\n' preview-pr-7.tar.gz preview-pr-7-0123456789abcdef.tar.gz preview-pr-70-0123456789abcdef.tar.gz preview-pr-17.tar.gz
fi
`,
      { mode: 0o755 },
    );
    const run = (pr, release = '') =>
      spawnSync(
        'bash',
        [path.resolve(import.meta.dirname, '..', 'delete-preview-payloads.sh'), pr],
        {
          encoding: 'utf8',
          // As in the eviction loop, whose remaining entries are on stdin.
          input: '4 failed\n5 closed\n',
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            GITHUB_REPOSITORY: 'o/r',
            PREVIEW_RELEASE: 'factory-previews',
            GH_RELEASE: release,
          },
        },
      );
    const result = run('7');
    assert.equal(result.status, 0, result.stderr);
    const deleted = readFileSync(log, 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('release delete-asset'))
      .map((line) => line.split(' ')[3]);
    assert.deepEqual(deleted, [
      'preview-pr-7.tar.gz',
      'preview-pr-7-0123456789abcdef.tar.gz',
    ]);
    assert.equal(readFileSync(path.join(root, 'stdin.log'), 'utf8'), '');
    assert.equal(run('7; rm -rf /').status, 2);
    // Only a missing release is nothing to delete; any other gh failure fails.
    const missing = run('7', 'missing');
    assert.equal(missing.status, 0, missing.stderr);
    assert.match(missing.stdout, /no preview release; nothing to delete/);
    const down = run('7', 'down');
    assert.equal(down.status, 1);
    assert.match(down.stderr, /::error::Could not list the factory-previews assets of PR #7: HTTP 502/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('teardown retries removing the preview and deletes the payloads even when that fails', () => {
  const remove = teardown.slice(
    teardown.indexOf('- name: Remove the preview'),
    teardown.indexOf('- name: Delete the temporary payloads'),
  );
  assert.match(remove, /for attempt in 1 2 3; do/);
  assert.match(remove, /ssh -n /);
  assert.match(remove, /sleep \$\(\( attempt \* 15 \)\)/);
  // The job still fails, so a preview left running is visible.
  assert.match(remove, /::error::Could not remove the preview[^\n]*\n\s+exit 1/);
  assert.doesNotMatch(remove, /continue-on-error/);
  assert.match(
    teardown,
    /- name: Delete the temporary payloads\n\s+if: \$\{\{ !cancelled\(\) \}\}/,
  );
  // The job guard still decides whether any of this runs.
  assert.match(
    teardown,
    /startsWith\(github\.event\.pull_request\.head\.ref, 'agent\/issue-'\)/,
  );
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

test('teardown shares the deploy queue and never hides its own failure', () => {
  // A deploy that holds the group before the close must finish before teardown
  // removes it. The group sits on the jobs, not the workflows, so a gated or
  // skipped run never queues behind a 45-minute deploy.
  const job = (workflow, name) =>
    workflow.split(`\n  ${name}:\n`)[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];
  const group = (body) => /^ {4}concurrency:\n {6}group: (\S+)\n {6}queue: max$/m.exec(body)?.[1];
  for (const workflow of [teardown, deploy]) assert.doesNotMatch(workflow, /^concurrency:/m);
  assert.equal(group(job(teardown, 'teardown-preview')), 'factory-preview-deploy');
  assert.equal(group(job(deploy, 'deploy-preview')), 'factory-preview-deploy');
  assert.doesNotMatch(teardown.split('steps:')[0], /^\s{4}continue-on-error: true/m);
  // A deploy that starts after the close must not bring the preview back.
  const script = readFileSync(
    path.resolve(import.meta.dirname, '..', 'deploy-preview.mjs'),
    'utf8',
  );
  assert.equal((script.match(/pr\.state !== 'open'/g) ?? []).length, 2);
});

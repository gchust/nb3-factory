import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { taskOutcome } from '../task-outcome.mjs';

test('publishing a failed PR or preview cannot turn the task into a successful delivery', () => {
  assert.equal(
    taskOutcome({ conclusion: 'failure' }, [
      { name: 'agent', conclusion: 'failure' },
      { name: 'publish-failed', conclusion: 'success' },
      { name: 'preview-build-failed', conclusion: 'success' },
    ]),
    'failure',
  );
});

const workflow = readFileSync(
  path.resolve(
    import.meta.dirname,
    '..',
    '..',
    'workflows',
    'code-agent-task.yml',
  ),
  'utf8',
);

test('an existing Code Agent work branch goes straight to verification and repair', () => {
  assert.match(
    workflow,
    /needs\.prepare\.outputs\.base_ref != needs\.prepare\.outputs\.work_branch/,
  );
});

test('workflow uses the generic runner and new settings with legacy fallback', () => {
  assert.match(workflow, /node control\/\.github\/scripts\/install-agent\.mjs/);
  assert.match(
    workflow,
    /CODE_AGENT_ENGINE: \$\{\{ vars\.CODE_AGENT_ENGINE \}\}/,
  );
  assert.doesNotMatch(workflow, /pi-coding-agent|run-pi\.mjs|pi\.patch/);
});

test('each engine receives only its own secrets and configuration', () => {
  const linesOf = (name) =>
    workflow.split('\n').filter((line) => line.includes(`${name}:`));
  const apiKeys = linesOf('CODE_AGENT_API_KEY');
  const tokens = linesOf('CODEBUDDY_AUTH_TOKEN');
  const codebuddyKeys = linesOf('CODEBUDDY_API_KEY');
  assert.equal(apiKeys.length, 1); // shared by implementation, repair/QA and reply
  // Repair/QA, independent review, reply invocation and credential scrub share
  // one selected-engine map. The trusted publishers must not receive it.
  assert.equal((workflow.match(/env: \*agent-run-env/g) ?? []).length, 4);
  const scrub = workflow
    .split('- name: Collect comment reply diagnostics')[1]
    .split('- name: Save reply for trusted publisher')[0];
  assert.match(scrub, /if: always\(\)/);
  assert.match(scrub, /env: \*agent-run-env/);
  assert.match(scrub, /agent-invocation-record\.mjs stage-reply/);
  assert.doesNotMatch(
    workflow.split('  publish-reply:')[1],
    /agent-run-env|secrets\./,
  );
  assert.equal((workflow.match(/env: \*agent-install-env/g) ?? []).length, 1);
  assert.equal(tokens.length, 1);
  assert.equal(codebuddyKeys.length, 1);
  for (const line of apiKeys) {
    assert.ok(
      line.includes(
        "(vars.CODE_AGENT_ENGINE == '' || vars.CODE_AGENT_ENGINE == 'pi') && (secrets.CODE_AGENT_API_KEY || secrets.PI_API_KEY) || ''",
      ),
      line,
    );
  }
  for (const line of tokens) {
    assert.ok(
      line.includes(
        "vars.CODE_AGENT_ENGINE == 'codebuddy' && secrets.CODEBUDDY_AUTH_TOKEN || ''",
      ),
      line,
    );
  }
  for (const line of codebuddyKeys) {
    assert.ok(
      line.includes(
        "vars.CODE_AGENT_ENGINE == 'codebuddy' && secrets.CODEBUDDY_API_KEY || ''",
      ),
      line,
    );
  }
  for (const expected of [
    "CODEBUDDY_MODEL: ${{ vars.CODE_AGENT_ENGINE == 'codebuddy' && vars.CODEBUDDY_MODEL || '' }}",
    "CODEBUDDY_THINKING: ${{ vars.CODEBUDDY_THINKING || 'max' }}",
    "CODEBUDDY_BASE_URL: ${{ vars.CODE_AGENT_ENGINE == 'codebuddy' && vars.CODEBUDDY_BASE_URL || '' }}",
    "CODE_AGENT_API_ENDPOINT: ${{ (vars.CODE_AGENT_ENGINE == '' || vars.CODE_AGENT_ENGINE == 'pi') && (secrets.CODE_AGENT_API_ENDPOINT || secrets.PI_API_ENDPOINT) || '' }}",
    'CODEBUDDY_VERSION: ${{ vars.CODEBUDDY_VERSION }}',
    'PI_VERSION: ${{ vars.PI_VERSION }}',
  ]) {
    assert.ok(workflow.includes(expected), expected);
  }
});

test('new engines have explicit credential mappings, never a Pi fallback', () => {
  for (const [engine, secret] of [
    ['claude-code', 'ANTHROPIC_API_KEY'],
    ['claude-code', 'CLAUDE_CODE_OAUTH_TOKEN'],
    ['codex', 'CODEX_API_KEY'],
    ['opencode', 'OPENCODE_API_KEY'],
  ]) {
    assert.ok(
      workflow.includes(
        `vars.CODE_AGENT_ENGINE == '${engine}' && secrets.${secret} || ''`,
      ),
    );
  }
  assert.doesNotMatch(workflow, /CODE_AGENT_ENGINE != 'codebuddy'/);
  assert.doesNotMatch(workflow, /toJSON\(secrets\)|<<:/);
});

test('different Issues run concurrently while one Issue stays serialized', () => {
  assert.doesNotMatch(workflow, /group: code-agent-global/);
  assert.match(
    workflow,
    /group: code-agent-task-\$\{\{ github\.event\.issue\.number \|\| github\.event\.client_payload\.issue_number \|\| inputs\.issue_number \|\| github\.run_id \}\}/,
  );
  assert.match(workflow, /queue: max/);
});

test('PR completion uses only trusted control-plane code for agent task branches', () => {
  const completion = readFileSync(
    path.resolve(
      import.meta.dirname,
      '..',
      '..',
      'workflows',
      'code-agent-pr-completed.yml',
    ),
    'utf8',
  );
  assert.match(completion, /pull_request_target:\n\s+types: \[closed\]/);
  assert.match(completion, /github\.event\.repository\.default_branch/);
  assert.match(completion, /'agent\/issue-'/);
  assert.doesNotMatch(completion, /'pi\/issue-'/);
  assert.doesNotMatch(completion, /pnpm|npm|pull_request\.head\.sha|secrets\./);
});

test('only the comment build queue listens to Issue comments', () => {
  // Every other workflow triggered on each comment only to skip it; maintainer
  // entry points are workflow_dispatch.
  const directory = path.resolve(import.meta.dirname, '..', '..', 'workflows');
  const listeners = readdirSync(directory).filter((name) =>
    /^\s{2}issue_comment:/m.test(
      readFileSync(path.join(directory, name), 'utf8'),
    ),
  );
  assert.deepEqual(listeners, ['comment-build-queue.yml']);
});

test('implementation and repair default to unlimited invocations and max thinking', () => {
  const timeoutLines = workflow
    .split('\n')
    .filter(
      (line) =>
        line.includes('CODE_AGENT_INVOCATION_TIMEOUT_SECONDS:') &&
        !line.includes("'900'"),
    );
  const thinkingLines = workflow
    .split('\n')
    .filter((line) => line.includes('CODE_AGENT_THINKING:'));
  assert.equal(timeoutLines.length, 1);
  assert.match(workflow, /CODE_AGENT_INVOCATION_TIMEOUT_SECONDS=900 node/);
  assert.equal(thinkingLines.length, 1);
  for (const line of timeoutLines)
    assert.match(line, /vars\.PI_INVOCATION_TIMEOUT_SECONDS \|\| '0'/);
  for (const line of thinkingLines)
    assert.match(line, /vars\.PI_THINKING \|\| 'max'/);
  assert.match(workflow, /timeout-minutes: 360/);
});

test('runner budget checkpoints and continues instead of failing at six hours', () => {
  assert.match(workflow, /code-agent-continue/);
  assert.match(workflow, /FACTORY_RUN_DEADLINE_EPOCH_SECONDS=.*18000/);
  assert.match(
    workflow,
    /factory-handoff-\$\{\{ needs\.prepare\.outputs\.issue_number \}\}/,
  );
  assert.match(
    workflow,
    /run-id: \$\{\{ github\.event\.client_payload\.previous_run_id \}\}/,
  );
  assert.match(workflow, /steps\.implementation\.outputs\.handoff == 'true'/);
  assert.match(workflow, /steps\.verify\.outputs\.handoff == 'true'/);
  assert.match(workflow, /needs\.agent\.outputs\.handoff != 'true'/);
  assert.match(workflow, /handoff\.mjs dispatch/);
});

test('continuation skips initial implementation and restores the previous patch', () => {
  assert.match(workflow, /github\.event\.action == 'code-agent-continue'/);
  assert.match(workflow, /--patch handoff\/agent\.patch/);
  assert.match(
    workflow,
    /!\(github\.event_name == 'repository_dispatch' && github\.event\.action == 'code-agent-continue'\)/,
  );
});

test('a failed agent preserves a checkpoint and can publish failed work without continuing QA', () => {
  const patch = workflow
    .split('- name: Create deterministic patch')[1]
    .split('- name: Prepare runner handoff metadata')[0];
  assert.match(
    patch,
    /failure\(\) && \(steps\.implementation\.outcome == 'failure' \|\| steps\.verify\.outcome == 'failure' \|\| steps\.failure_smoke\.outcome == 'failure'\)/,
  );
  assert.match(patch, /id: patch/);
  const allowEmpty = patch.split('ALLOW_EMPTY_PATCH:')[1].split('\n')[0];
  assert.match(allowEmpty, /steps\.implementation\.outcome == 'failure'/);
  assert.match(allowEmpty, /steps\.verify\.outcome == 'failure'/);
  // Status check functions only work in if, not step env expressions.
  assert.doesNotMatch(allowEmpty, /(?:always|cancelled|failure|success)\(\)/);
  const checkpoint = workflow
    .split('- name: Upload handoff checkpoint')[1]
    .split('- name: Dispatch continuation run')[0];
  assert.match(checkpoint, /always\(\) && steps\.patch\.outcome == 'success'/);
  assert.match(
    checkpoint,
    /steps\.handoff\.outcome == 'success' \|\| failure\(\)/,
  );
  const dispatch = workflow
    .split('- name: Dispatch continuation run')[1]
    .split('- name: Record agent outcome')[0];
  assert.match(dispatch, /if: steps\.handoff\.outcome == 'success'/);
  assert.match(dispatch, /id: dispatch/);
  // A lost checkpoint or dispatch is a failed run, not a silent handoff.
  const outcome = workflow
    .split('- name: Record agent outcome')[1]
    .split('- name: ')[0];
  assert.match(
    outcome,
    /"\$HANDOFF_OUTCOME" == "success" && "\$CHECKPOINT_OUTCOME" == "success" && "\$DISPATCH_OUTCOME" == "success"/,
  );
  assert.match(
    workflow,
    /if: needs\.agent\.result == 'success' && needs\.agent\.outputs\.handoff != 'true'/,
  );
  assert.match(workflow, /if: needs\.verify-final\.result == 'success'/);
  const failed = workflow
    .split('  publish-failed:')[1]
    .split('  preview-build-failed:')[0];
  assert.match(failed, /always\(\) && !cancelled\(\)/);
  assert.match(failed, /needs.agent.outputs.patch_available == 'true'/);
  assert.match(failed, /needs.agent.outputs.handoff != 'true'/);
  assert.match(
    failed,
    /needs.agent.result != 'success' \|\| needs.verify-final.result != 'success'/,
  );
  assert.match(failed, /FACTORY_DELIVERY_STATUS: failed/);
  assert.match(failed, /steps: \*publication-steps/);
  const preview = workflow
    .split('  preview-build-failed:')[1]
    .split('  report-failure:')[0];
  assert.match(preview, /needs.publish-failed.result == 'success'/);
  assert.match(preview, /timeout-minutes: 30/);
  assert.match(
    preview,
    /pnpm build --target linux-x64 --node-version 24 --tar/,
  );
  assert.doesNotMatch(
    preview,
    /secrets\.|verify-and-repair|run-agent|verify\.sh|contents: write/,
  );
});

test('comment questions bypass implementation and publish replies through an isolated job', () => {
  assert.match(
    workflow,
    /if: needs.prepare.outputs.status == 'ready' && needs.prepare.outputs.comment_kind != 'reply'/,
  );
  const reply = workflow.split('  reply:')[1].split('  publish-reply:')[0];
  assert.match(reply, /needs.publish-failed.result == 'success' && 'failure'/);
  assert.match(
    reply,
    /needs.publish-failed.result == 'success'\) && needs.prepare.outputs.work_branch/,
  );
  assert.doesNotMatch(reply, /GITHUB_TOKEN:|issues: write|contents: write/);
  assert.match(reply, /contents: read/);
  assert.match(reply, /persist-credentials: false/);
  assert.match(reply, /needs.agent.outputs.handoff != 'true'/);
  assert.match(
    workflow,
    /BUILD_COMMENT_ID: \$\{\{ needs.prepare.outputs.build_comment_id \}\}/,
  );
  assert.match(
    workflow,
    /base_ref != needs.prepare.outputs.work_branch \|\| needs.prepare.outputs.build_comment_id != ''/,
  );
});

test('runner-local timing paths are initialized in steps, not job-level env', () => {
  const workflow = readFileSync(
    path.resolve(
      import.meta.dirname,
      '..',
      '..',
      'workflows',
      'code-agent-task.yml',
    ),
    'utf8',
  );
  assert.doesNotMatch(workflow, /^ {6}FACTORY_.*\$\{\{ runner\./m);
  assert.match(
    workflow,
    /FACTORY_TIMINGS_FILE=\$RUNNER_TEMP\/agent-artifacts\/timings\.jsonl/,
  );
  assert.match(
    workflow,
    /FACTORY_TIMINGS_FILE=\$RUNNER_TEMP\/final-artifacts\/timings\.jsonl/,
  );
  assert.doesNotMatch(workflow, /FACTORY_DEPENDENCY_CACHE/);
});

test('every remote action is pinned to a full commit SHA with its version noted', () => {
  const directory = new URL('../../workflows/', import.meta.url);
  for (const name of readdirSync(directory).filter((file) => file.endsWith('.yml'))) {
    const source = readFileSync(new URL(name, directory), 'utf8');
    for (const [, reference] of source.matchAll(/^\s*(?:-\s+)?uses:\s+(\S+.*)$/gm)) {
      if (reference.startsWith('./')) continue;
      assert.match(reference, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, `${name}: ${reference}`);
    }
  }
});

test('a prepare failure after ready clears agent:running for any build, not only recoveries', () => {
  const prepare = workflow.split('\n  prepare:')[1].split('\n  agent:')[0];
  const cleanup = prepare.split('- name: Report a failure after task preparation')[1];
  assert.ok(cleanup, 'prepare must report its own late failure');
  const condition = /if: ([^\n]+)/.exec(cleanup)[1];
  assert.match(condition, /failure\(\) && steps\.prepare\.outputs\.status == 'ready'/);
  assert.match(condition, /steps\.prepare\.outputs\.comment_kind != 'reply'/);
  assert.doesNotMatch(condition, /recovery_run_id/);
  assert.match(cleanup, /mark-failure\.mjs/);
});

test('every history publisher creates the shared release when it is missing', () => {
  const directory = new URL('../../workflows/', import.meta.url);
  let checked = 0;
  for (const name of readdirSync(directory).filter((file) => file.endsWith('.yml'))) {
    const source = readFileSync(new URL(name, directory), 'utf8');
    if (!source.includes('gh release upload factory-history')) continue;
    checked++;
    assert.match(
      source,
      /if ! gh release view factory-history --repo "\$GITHUB_REPOSITORY" >\/dev\/null 2>&1; then\n\s+gh release create factory-history /,
      name,
    );
  }
  assert.ok(checked >= 3);
});

// The relative modules a script loads, transitively, as .github/... paths.
function importClosure(...entries) {
  const scripts = path.resolve(import.meta.dirname, '..');
  const seen = new Set();
  const pending = entries.map((entry) => path.join(scripts, entry));
  while (pending.length) {
    const file = pending.pop();
    // Import text inside generated sources (the overlay's eslint.config.js)
    // is relative to the application, not to the script.
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const [, specifier] of source.matchAll(
      /(?:\bfrom|\bimport\s*\(?)\s*['"](\.{1,2}\/[^'"]+)['"]/g,
    ))
      pending.push(path.resolve(path.dirname(file), specifier));
  }
  return [...seen].map((file) =>
    path.relative(path.resolve(scripts, '..', '..'), file),
  );
}

function pullRequestPaths(name) {
  const source = readFileSync(
    new URL(`../../workflows/${name}`, import.meta.url),
    'utf8',
  );
  const block = source.split('  pull_request:\n')[1].split(/\n {2}\w/)[0];
  return [...block.matchAll(/^ {6}- '([^']+)'$/gm)].map(([, glob]) => {
    const pattern = glob
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '\0')
      .replace(/\*/g, '[^/]*')
      .replace(/\0/g, '.*');
    return new RegExp(`^${pattern}$`);
  });
}

test('the Agent CLI check runs whenever a module the adapters load changes', () => {
  const filters = pullRequestPaths('agent-adapters.yml');
  for (const file of importClosure(
    'install-agent.mjs',
    'run-agent.mjs',
    'agent-cli-smoke.mjs',
    'tests/codex-agent.integration.mjs',
  ))
    assert.ok(
      filters.some((filter) => filter.test(file)),
      file,
    );
});

test('the source baseline check runs whenever a script it runs changes', () => {
  const filters = pullRequestPaths('source-baseline.yml');
  const source = readFileSync(
    new URL('../../workflows/source-baseline.yml', import.meta.url),
    'utf8',
  );
  const run = [
    ...new Set(
      [...source.matchAll(/\.github\/scripts\/([\w-]+\.(?:mjs|sh))/g)].map(
        ([, file]) => file,
      ),
    ),
  ];
  assert.ok(run.includes('verify.sh'));
  const verify = readFileSync(
    path.resolve(import.meta.dirname, '../verify.sh'),
    'utf8',
  );
  const viaVerify = [
    ...verify.matchAll(/\$script_dir\/([\w-]+\.(?:mjs|sh))/g),
  ].map(([, file]) => file);
  const shell = [...run, ...viaVerify].filter((file) => file.endsWith('.sh'));
  for (const file of [
    ...importClosure(...[...run, ...viaVerify].filter((file) => file.endsWith('.mjs'))),
    ...shell.map((file) => `.github/scripts/${file}`),
  ])
    assert.ok(
      filters.some((filter) => filter.test(file)),
      file,
    );
});

test('CI installs the Agent Browser and Agent CLIs build tasks would install', async () => {
  const { normalizeAgentEnv } = await import('../agent-configuration.mjs');
  const fallback = normalizeAgentEnv({}).AGENT_BROWSER_VERSION;
  const browser = `AGENT_BROWSER_VERSION: \${{ vars.AGENT_BROWSER_VERSION || '${fallback}' }}`;
  const tests = readFileSync(
    new URL('../../workflows/factory-tests.yml', import.meta.url),
    'utf8',
  );
  assert.ok(workflow.includes(browser));
  assert.ok(tests.includes(browser));
  assert.doesNotMatch(tests, /agent-browser@\d/);
  const adapters = readFileSync(
    new URL('../../workflows/agent-adapters.yml', import.meta.url),
    'utf8',
  );
  for (const name of [
    'CODE_AGENT_VERSION',
    'PI_VERSION',
    'CODEBUDDY_VERSION',
    'CLAUDE_CODE_VERSION',
    'CODEX_VERSION',
    'OPENCODE_VERSION',
  ]) {
    assert.ok(workflow.includes(`${name}: \${{ vars.${name} }}`), name);
    assert.ok(adapters.includes(`${name}: \${{ vars.${name} }}`), name);
  }
});

test('regression checks cancel superseded PR runs but never a pending push or dispatch', () => {
  const directory = new URL('../../workflows/', import.meta.url);
  for (const name of ['factory-tests.yml', 'agent-adapters.yml']) {
    const source = readFileSync(new URL(name, directory), 'utf8');
    const block = /^concurrency:\n((?: {2}.*\n)+)/m.exec(source)[1];
    // A shared push group without a queue replaces a pending run with a newer one.
    assert.match(
      block,
      /group: [\w-]+-\$\{\{ github\.event_name == 'pull_request' && format\('pr-\{0\}', github\.event\.pull_request\.number\) \|\| format\('run-\{0\}', github\.run_id\) \}\}/,
      name,
    );
    assert.match(block, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/, name);
  }
});

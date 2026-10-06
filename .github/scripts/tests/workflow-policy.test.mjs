import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
  // An explicit status function, so a failed always() upload before it does
  // not imply success() and skip the continuation.
  assert.match(
    dispatch,
    /if: \$\{\{ !cancelled\(\) && steps\.handoff\.outcome == 'success' && steps\.checkpoint\.outcome == 'success' \}\}/,
  );
  assert.match(dispatch, /id: dispatch/);
  // Every always() step between the handoff and the dispatch either cannot
  // fail the job or is the checkpoint the dispatch already depends on.
  const afterHandoff = workflow
    .split('- name: Prepare runner handoff metadata')[1]
    .split('- name: Dispatch continuation run')[0]
    .split('\n      - name: ')
    .slice(1);
  for (const step of afterHandoff) {
    if (!/\n {8}if: always\(\)/.test(step) || /\n {8}continue-on-error: true/.test(step)) continue;
    assert.match(step, /^(Upload Code Agent patch and diagnostics|Upload handoff checkpoint)\n/);
  }
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

test('each remote action uses one pinned release across all workflows', () => {
  // A step added beside an upgrade merges without conflict and can keep the old pin.
  const directory = new URL('../../workflows/', import.meta.url);
  const pins = new Map();
  for (const name of readdirSync(directory).filter((file) => file.endsWith('.yml'))) {
    const source = readFileSync(new URL(name, directory), 'utf8');
    for (const [, action, pin] of source.matchAll(/^\s*(?:-\s+)?uses:\s+([\w.-]+\/[\w.-]+)[\w./-]*@(\S+ # \S+)$/gm)) {
      const seen = pins.get(action);
      if (seen) assert.equal(pin, seen.pin, `${name}: ${action} differs from ${seen.name}`);
      else pins.set(action, { pin, name });
    }
  }
});

test('every job runs on a pinned runner image, never a moving label', () => {
  // ubuntu-latest moves to a new release on GitHub's schedule; the browser,
  // fonts, ffmpeg and prebuilt binaries the jobs use depend on the image.
  const directory = new URL('../../workflows/', import.meta.url);
  let checked = 0;
  for (const name of readdirSync(directory).filter((file) => file.endsWith('.yml'))) {
    const source = readFileSync(new URL(name, directory), 'utf8');
    assert.doesNotMatch(source, /-latest\b/, name);
    for (const [, runner] of source.matchAll(/^\s*runs-on:\s*(.+)$/gm)) {
      checked++;
      assert.match(runner, /^ubuntu-\d{2}\.\d{2}$/, `${name}: ${runner}`);
    }
  }
  assert.ok(checked >= 50);
});

test('browser font installs retry apt and are bounded by a step timeout', () => {
  const script = readFileSync(
    path.resolve(import.meta.dirname, '../install-browser-fonts.sh'),
    'utf8',
  );
  assert.match(script, /Acquire::Retries=3/);
  assert.match(script, /Acquire::http::Timeout=30/);
  assert.match(script, /for attempt in 1 2 3/);
  // Every round is bounded, and all three rounds fit the step timeout.
  const limits = [...script.matchAll(/sudo timeout --kill-after=(\d+)s (\d+)s apt-get/g)];
  assert.equal(limits.length, 2);
  const round = limits.reduce((sum, [, kill, limit]) => sum + Number(kill) + Number(limit), 0);
  const backoff = 10 + 20;
  assert.match(script, /sleep \$\(\( attempt \* 10 \)\)/);
  const budget = 3 * round + backoff;
  const directory = new URL('../../workflows/', import.meta.url);
  let checked = 0;
  for (const name of readdirSync(directory).filter((file) => file.endsWith('.yml'))) {
    const source = readFileSync(new URL(name, directory), 'utf8');
    for (const step of source.split(/\n\s+- (?=name:|uses:|run:)/)) {
      if (!/run:[^\n]*\n?[^\n]*install-browser-fonts\.sh/.test(step)) continue;
      checked++;
      const minutes = Number(/timeout-minutes: (\d+)\b/.exec(step)?.[1]);
      assert.ok(minutes > 0, `${name}: ${step.split('\n')[0]}`);
      // Leave a minute for fc-cache and the checks after the install.
      assert.ok(budget <= (minutes - 1) * 60, `${name}: ${budget}s vs ${minutes} min`);
    }
  }
  assert.ok(checked >= 5);
});

test('network installs in long jobs are bounded by a step timeout', () => {
  // A hung registry or download otherwise holds the runner until the job
  // limit, six hours for the agent job.
  const steps = {
    'code-agent-task.yml': [
      ['Install application dependencies', 3],
      ['Install pinned Code Agent', 2],
      ['Install pinned Agent Browser', 1],
    ],
    'framework-fix.yml': [
      ['Install nocobase3 dependencies', 1],
      ['Install pinned Claude Code', 1],
    ],
    'replay-build-review.yml': [
      ['Reconstruct sealed candidate without rebuilding', 1],
      ['Install selected pinned reviewer', 1],
    ],
    'classify-findings.yml': [['Install selected pinned classifier', 1]],
    'deliver-evaluation.yml': [['Install selected pinned classifier', 1]],
    'independent-review.yml': [['Install selected pinned reviewer', 1]],
    'source-baseline.yml': [
      ['Verify checkout identity and install source dependencies', 1],
      ['Lock the factory overlay against only the frozen source packages', 1],
    ],
    'refresh-template.yml': [
      ['Install and lock the new application dependencies', 1],
      ['Install, register, and inspect the required Pro plugin baseline', 1],
    ],
  };
  for (const [name, expected] of Object.entries(steps)) {
    const source = readFileSync(
      new URL(`../../workflows/${name}`, import.meta.url),
      'utf8',
    );
    for (const [step, count] of expected) {
      const bodies = source
        .split(`- name: ${step}\n`)
        .slice(1)
        .map((rest) => rest.split(/\n\s+- (?=name:|uses:)/)[0]);
      assert.equal(bodies.length, count, `${name}: ${step}`);
      for (const body of bodies)
        assert.match(body, /timeout-minutes: (?:10|15)\n/, `${name}: ${step}`);
    }
  }
});

test('no Python bytecode is committed or left by the factory tests', () => {
  // Everything under .github/ is copied into each refreshed baseline.
  const root = path.resolve(import.meta.dirname, '..', '..', '..');
  const tracked = execFileSync('git', ['-C', root, 'ls-files', '.github'], { encoding: 'utf8' })
    .split('\n')
    .filter((file) => /(^|\/)__pycache__\/|\.py[co]$/.test(file));
  assert.deepEqual(tracked, []);
  for (const file of ['browser-fixtures.test.py', 'preview-dns-sync.test.py'])
    assert.match(
      readFileSync(path.join(import.meta.dirname, file), 'utf8'),
      /^sys\.dont_write_bytecode = True\n(?:.*\n)*?spec = importlib/m,
      file,
    );
  assert.match(readFileSync(path.join(root, '.gitignore'), 'utf8'), /^__pycache__\/$/m);
  assert.match(
    readFileSync(path.join(root, '.github/scripts/overlay-factory.mjs'), 'utf8'),
    /\\n__pycache__\/\\n`/,
  );
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

// The .github/scripts files a workflow runs, directly or through verify.sh and
// its helpers, with the modules they load. Generated sources (the overlay's
// eslint.config.js) name factory scripts as .github/scripts/... paths.
function scriptsRunBy(name) {
  const read = (file) =>
    readFileSync(path.resolve(import.meta.dirname, '..', file), 'utf8');
  const source = readFileSync(
    new URL(`../../workflows/${name}`, import.meta.url),
    'utf8',
  );
  const named = (text, pattern) =>
    [...text.matchAll(pattern)].map(([, file]) => file);
  const run = new Set(named(source, /\.github\/scripts\/([\w-]+\.(?:mjs|sh))/g));
  for (const shell of [...run].filter((file) => file.endsWith('.sh')))
    for (const file of named(read(shell), /\$script_dir\/([\w-]+\.(?:mjs|sh))/g))
      run.add(file);
  const modules = importClosure(...[...run].filter((file) => file.endsWith('.mjs')));
  for (const file of modules)
    for (const generated of named(
      readFileSync(path.resolve(import.meta.dirname, '..', '..', '..', file), 'utf8'),
      /['"]\.\/\.github\/scripts\/([\w-]+\.mjs)['"]/g,
    ))
      modules.push(...importClosure(generated));
  return [
    ...new Set([
      ...modules,
      ...[...run]
        .filter((file) => file.endsWith('.sh'))
        .map((file) => `.github/scripts/${file}`),
    ]),
  ];
}

test('the source baseline check runs whenever a script it runs changes', () => {
  const filters = pullRequestPaths('source-baseline.yml');
  const files = scriptsRunBy('source-baseline.yml');
  assert.ok(files.includes('.github/scripts/verify.sh'));
  for (const file of files)
    assert.ok(
      filters.some((filter) => filter.test(file)),
      file,
    );
});

test('the template refresh check runs whenever a script or overlay input it uses changes', () => {
  const filters = pullRequestPaths('refresh-template.yml');
  const files = scriptsRunBy('refresh-template.yml');
  for (const expected of [
    '.github/scripts/verify.sh',
    '.github/scripts/overlay-factory.mjs',
    '.github/scripts/assert-current-template.mjs',
    '.github/scripts/factory-eslint.mjs',
    '.github/scripts/timed-command.mjs',
  ])
    assert.ok(files.includes(expected), expected);
  // overlay-factory.mjs copies these from the control checkout.
  const overlay = readFileSync(
    path.resolve(import.meta.dirname, '../overlay-factory.mjs'),
    'utf8',
  );
  assert.match(overlay, /path\.join\(control, '\.npmrc'\)/);
  assert.match(overlay, /section\('README\.MD', 'readme'\)/);
  for (const file of [...files, '.npmrc', 'README.MD'])
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

test('a skipped task run starts no report, sweep or preview from its completion event', () => {
  // The task workflow skips every job for an Issue from someone without
  // repository access, and GitHub still raises workflow_run for it with the
  // conclusion 'skipped'. Each listener filters that at its first job, in a
  // form that leaves workflow_dispatch and repository_dispatch untouched, and
  // again at the job behind the dispatch gate: a skipped gate leaves `covered`
  // empty, which a `!cancelled()` consumer reads as "do the work".
  const directory = path.resolve(import.meta.dirname, '..', '..', 'workflows');
  const condition = (body) =>
    /^ {4}if: (?:>-\n((?: {6}.*\n)+)|(.*))/m.exec(body)?.slice(1).join('') ?? '';
  const skipsSkipped = (expression) => {
    const list = /contains\(fromJSON\('(\[[^\]]*\])'\), github\.event\.workflow_run\.conclusion\)/.exec(expression);
    if (list) return !JSON.parse(list[1]).includes('skipped');
    return /github\.event_name == 'workflow_run' && github\.event\.workflow_run\.conclusion != 'skipped'|\(github\.event_name != 'workflow_run' \|\| github\.event\.workflow_run\.conclusion != 'skipped'\)/.test(expression);
  };
  let listeners = 0;
  let consumers = 0;
  for (const name of readdirSync(directory).filter((file) => file.endsWith('.yml'))) {
    const source = readFileSync(path.join(directory, name), 'utf8');
    // Every workflow_run listener, whichever workflow it follows: a reassessment
    // skipped by its own guards raises the same event.
    if (!/^  workflow_run:\n    workflows: \[/m.test(source)) continue;
    listeners++;
    const jobs = [...source.split(/^jobs:\n/m)[1].matchAll(/^ {2}([a-z][a-z-]*):\n((?: {4}.*\n|\s*\n)*)/gm)];
    const [, first, body] = jobs[0];
    assert.ok(skipsSkipped(condition(body)), `${name}: ${first}`);
    for (const [, id, consumer] of jobs.filter(([, , text]) => /^ {4}needs: dispatch-gate$/m.test(text))) {
      consumers++;
      assert.ok(skipsSkipped(condition(consumer)), `${name}: ${id}`);
    }
  }
  assert.equal(listeners, 8);
  assert.equal(consumers, 6);
});

test('a failed visual report publication fails its run and names the replay', () => {
  const source = readFileSync(
    path.resolve(import.meta.dirname, '../../workflows/publish-visual-report.yml'),
    'utf8',
  );
  const publish = source
    .split('- name: Publish PR screenshots and recordings (artifact fallback)\n')[1]
    .split('\n      - name: ')[0];
  assert.match(publish, /^ {8}id: publish\n/m);
  assert.match(publish, /continue-on-error: true/);
  const visible = source.split(
    '- name: Keep publication failures visible without rebuilding the application\n',
  )[1];
  assert.ok(visible, 'the failure step is missing');
  assert.match(visible, /^ {8}if: always\(\) && steps\.publish\.outcome == 'failure'\n/m);
  assert.match(
    visible,
    /::error::[^\n]*Publish Task Visual Report[^\n]*run_id=\$SOURCE_RUN_ID[^\n]*attempt=\$SOURCE_ATTEMPT[^\n]*REPORT_DISPATCH\.md/,
  );
  assert.match(visible, /\n\s+exit 1\n/);
  // The same shape the history publisher uses.
  assert.match(
    readFileSync(path.resolve(import.meta.dirname, '../../workflows/publish-agent-history.yml'), 'utf8'),
    /- name: Keep publication failures visible without rebuilding the application\n\s+if: always\(\) && \(steps\.pack\.outcome == 'failure'/,
  );
});

test('the replayed usage report serializes with the other page writers and inherits no secrets', () => {
  const source = readFileSync(
    path.resolve(import.meta.dirname, '../../workflows/replay-build-review.yml'),
    'utf8',
  );
  const report = source.split('\n  report:\n')[1].split(/\n {2}[a-z][a-z-]*:\n/)[0];
  assert.match(report, /uses: \.\/\.github\/workflows\/report-task-usage\.yml/);
  // A called workflow's own concurrency applies to its top-level runs, not to
  // a job that calls it; the caller job names the shared group itself.
  assert.match(report, /^ {4}concurrency:\n {6}group: factory-task-usage\n {6}queue: max\n/m);
  assert.doesNotMatch(report, /secrets: inherit/);
  // There is nothing to inherit: the reporter reads github.token only.
  assert.doesNotMatch(
    readFileSync(path.resolve(import.meta.dirname, '../../workflows/report-task-usage.yml'), 'utf8'),
    /secrets\./,
  );
});

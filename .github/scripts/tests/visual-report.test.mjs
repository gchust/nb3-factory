import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  collectMedia,
  matchesTaskPR,
  renderReport,
  selectArtifact,
  text,
} from '../visual-report.mjs';

const exec = promisify(execFile);
const repository = 'gchust/nb3-factory';
const runId = 123;
const runUrl = `https://github.com/${repository}/actions/runs/${runId}`;
const headSha = 'a'.repeat(40);
const artifact = { name: 'factory-agent-18', id: 55, expired: false };
const run = {
  id: runId,
  path: '.github/workflows/code-agent-task.yml',
  head_repository: { full_name: repository },
  head_branch: 'develop',
  event: 'issues',
  status: 'completed',
  conclusion: 'success',
  run_attempt: 1,
};
const jobs = ['verify-final', 'publish'].map((name) => ({
  name,
  conclusion: 'success',
}));
const metadata = {
  repository,
  issue: { number: 18 },
  workBranch: 'agent/issue-18',
  task: { targetBranch: 'apps/demo' },
};
const pr = {
  number: 19,
  head: {
    sha: headSha,
    ref: metadata.workBranch,
    repo: { full_name: repository },
  },
  base: { ref: 'apps/demo' },
  body: `<!-- agent-issue: 18 -->\n<!-- agent-head-sha: ${headSha} -->\n- [GitHub Actions 运行记录](${runUrl})`,
};
const write = (root, relative, value) => {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    typeof value === 'object' && !Buffer.isBuffer(value)
      ? JSON.stringify(value)
      : value,
  );
};
const png = Buffer.concat([
  Buffer.from('89504e470d0a1a0a', 'hex'),
  Buffer.alloc(1200),
]);
const webm = Buffer.concat([
  Buffer.from('1a45dfa3', 'hex'),
  Buffer.alloc(1200),
]);
const prefix = 'verify-2/browser-acceptance';
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nb3-visual-'));
  const artifacts = path.join(root, 'artifacts');
  const output = path.join(root, 'media');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  write(artifacts, 'task-metadata.json', metadata);
  write(artifacts, 'repair-summary.json', {
    verificationAttempts: 2,
    repairAttempts: 1,
  });
  write(artifacts, `${prefix}/report.json`, {
    passed: true,
    authenticated: true,
    checks: [
      {
        status: 'passed',
        criterion: '资产列表',
        screenshots: ['page-assets.png'],
      },
    ],
    failures: [],
  });
  write(artifacts, `${prefix}/showcase.json`, {
    pages: [
      { title: '资产列表（管理员）', screenshot: 'page-assets.png' },
      { title: '详情', screenshot: 'page-detail.png' },
    ],
    videos: [{ title: '领用与归还', file: 'flow-checkout.webm' }],
    uncovered: [],
  });
  write(artifacts, `${prefix}/evidence/page-assets.png`, png);
  write(artifacts, `${prefix}/evidence/page-detail.png`, png);
  write(artifacts, `${prefix}/evidence/flow-checkout.webm`, webm);
  write(artifacts, 'verify-1/browser-acceptance/evidence/failed.png', png);
  return { root, artifacts, output };
}

test('only a successfully published same-repository task can publish media', () => {
  assert.equal(selectArtifact(run, jobs, [artifact], repository), artifact);
  assert.equal(
    selectArtifact(
      run,
      [{ name: 'agent', conclusion: 'success' }],
      [artifact],
      repository,
    ),
    null,
  );
  assert.equal(
    selectArtifact(
      { ...run, conclusion: 'failure' },
      jobs,
      [artifact],
      repository,
    ),
    null,
  );
  assert.throws(
    () =>
      selectArtifact(
        { ...run, head_repository: { full_name: 'fork/repo' } },
        jobs,
        [artifact],
        repository,
      ),
    /same-repository/,
  );
  assert.throws(
    () =>
      selectArtifact(run, jobs, [{ ...artifact, expired: true }], repository),
    /unexpired/,
  );
});

test('binds reports to the publishing run and rejects changed PR commits', () => {
  const source = { repository, runUrl };
  assert.ok(matchesTaskPR(pr, metadata, source));
  assert.ok(
    !matchesTaskPR(
      { ...pr, head: { ...pr.head, sha: 'b'.repeat(40) } },
      metadata,
      source,
    ),
  );
  assert.ok(!matchesTaskPR(pr, metadata, { ...source, runUrl: runUrl + '9' }));
});

test('collects final-round page screenshots and recordings without failed-round files or duplicate shots', (t) => {
  const f = fixture(t);
  const plan = collectMedia(f.artifacts, f.output);
  assert.equal(plan.attempt, 2);
  assert.deepEqual(
    plan.media.map((m) => m.name),
    ['page-assets.png', 'page-detail.png', 'flow-checkout.webm'],
  );
  assert.equal(existsSync(path.join(f.output, 'failed.png')), false);
  assert.deepEqual(plan.warnings, []);
});

test('legacy screenshot-only reports remain usable and do not claim full page coverage', (t) => {
  const f = fixture(t);
  rmSync(path.join(f.artifacts, prefix, 'showcase.json'));
  const plan = collectMedia(f.artifacts, f.output);
  assert.equal(plan.media.length, 1);
  assert.match(plan.warnings.join(' '), /不代表覆盖全部界面/);
  assert.match(plan.warnings.join(' '), /没有可内嵌的操作录像/);
});

test('refuses handoff and failed final reports instead of substituting an earlier passing attempt', (t) => {
  const f = fixture(t);
  write(f.artifacts, 'repair-summary.json', {
    verificationAttempts: 2,
    handoff: true,
  });
  assert.throws(
    () => collectMedia(f.artifacts, f.output),
    /completed verification/,
  );
  write(f.artifacts, 'repair-summary.json', { verificationAttempts: 2 });
  write(f.artifacts, `${prefix}/report.json`, { passed: false });
  assert.throws(() => collectMedia(f.artifacts, f.output), /not passed/);
});

test('rejects traversal, symlinks, external URLs, and invalid file types without uploading other files', (t) => {
  const f = fixture(t);
  write(f.root, 'secret.png', png);
  symlinkSync(
    path.join(f.root, 'secret.png'),
    path.join(f.artifacts, prefix, 'evidence', 'linked.png'),
  );
  write(f.artifacts, `${prefix}/evidence/invalid.png`, 'not a screenshot');
  write(f.artifacts, `${prefix}/showcase.json`, {
    pages: [
      '../../secret.png',
      'linked.png',
      'https://evil.example/a.png',
      'invalid.png',
    ].map((screenshot) => ({ title: '@everyone <img>', screenshot })),
  });
  const plan = collectMedia(f.artifacts, f.output);
  assert.deepEqual(
    plan.media.map((m) => m.name),
    ['page-assets.png'],
  );
  assert.ok(plan.warnings.length >= 4);
});

test('oversized recordings are not attached; they remain in the original artifact', (t) => {
  const f = fixture(t);
  write(
    f.artifacts,
    `${prefix}/evidence/flow-checkout.webm`,
    Buffer.concat([webm, Buffer.alloc(9_500_000)]),
  );
  const plan = collectMedia(f.artifacts, f.output);
  assert.equal(plan.media.filter((m) => m.kind === 'webm').length, 0);
  assert.match(plan.warnings.join(' '), /原始 Artifact/);
  assert.ok(
    existsSync(path.join(f.artifacts, prefix, 'evidence/flow-checkout.webm')),
  );
});

test('report markdown uses local attachments and escapes titles and mentions', (t) => {
  const f = fixture(t);
  const plan = {
    ...collectMedia(f.artifacts, f.output),
    runId,
    runUrl,
    runAttempt: 1,
    headSha,
    sourceArtifactUrl: `${runUrl}/artifacts/55`,
  };
  const body = renderReport(plan, true);
  assert.match(body, /!\[.*\]\(\.\/page-assets.png\)/);
  assert.match(body, /\n\.\/flow-checkout.webm\n/);
  assert.doesNotMatch(
    text('@everyone <script> [link](bad)'),
    /<script>|@everyone|(?<!\\)\[link\]/,
  );
  const fallback = renderReport(plan, false, '配置 Token 后可补发');
  assert.doesNotMatch(fallback, /!\[/);
  assert.match(fallback, /配置 Token/);
});

async function publisherFixture(t, ghMode, pendingPolls = 0) {
  const f = fixture(t);
  const calls = [];
  const comments = [
    {
      id: 9,
      body: 'Human note that must never be edited',
      user: { login: 'gchust' },
    },
  ];
  let currentPR = { ...pr };
  const server = http.createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const url = new URL(request.url, 'http://fixture');
    const route = url.pathname.replace(`/repos/${repository}`, '');
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ route, method: request.method, body });
    let result;
    if (route === '') result = { default_branch: 'develop' };
    else if (
      [`/actions/runs/${runId}`, `/actions/runs/${runId}/attempts/1`].includes(
        route,
      )
    )
      result = {
        ...run,
        event: 'repository_dispatch',
        status: pendingPolls-- > 0 ? 'in_progress' : 'completed',
      };
    else if (route.endsWith('/jobs')) result = { jobs };
    else if (route.endsWith('/artifacts')) result = { artifacts: [artifact] };
    else if (route === '/pulls') result = [currentPR];
    else if (route === '/pulls/19') result = currentPR;
    else if (route === '/issues/19/comments' && request.method === 'GET')
      result = comments;
    else if (route === '/issues/19/comments' && request.method === 'POST') {
      const user = {
        login:
          request.headers.authorization === 'Bearer native-fixture'
            ? 'gchust'
            : 'github-actions[bot]',
      };
      result = { id: 10 + comments.length, body: body.body, user };
      comments.push(result);
    } else if (route.startsWith('/issues/comments/')) {
      const id = Number(route.split('/').at(-1));
      const index = comments.findIndex((c) => c.id === id);
      assert.ok(index >= 0);
      assert.equal(comments[index].user.login, 'github-actions[bot]');
      if (request.method === 'DELETE') {
        comments.splice(index, 1);
        response.writeHead(204);
        response.end();
        return;
      }
      comments[index].body = body.body;
      result = comments[index];
    } else {
      response.writeHead(404);
      response.end('{}');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(result));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const gh = path.join(f.root, 'gh');
  writeFileSync(
    gh,
    `#!/usr/bin/env node\nconst args=process.argv.slice(2);\nif(args.includes('--help')){console.log('--attach');process.exit(0);}\nif(process.env.GITHUB_TOKEN)throw new Error('Built-in token leaked to uploader');\nif(process.env.TEST_GH_MODE==='fail')process.exit(1);\nconst fs=await import('node:fs');\nconst body=fs.readFileSync(args[args.indexOf('--body-file')+1],'utf8');\nif(!args.includes('./flow-checkout.webm'))throw new Error('Missing recording attachment');\nawait fetch(process.env.GITHUB_API_URL+'/repos/${repository}/issues/19/comments',{method:'POST',headers:{Authorization:'Bearer '+process.env.GH_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({body})});\nprocess.exit(process.env.TEST_GH_MODE==='posted-but-error'?1:0);\n`,
  );
  chmodSync(gh, 0o755);
  const env = {
    ...process.env,
    GITHUB_REPOSITORY: repository,
    GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
    GITHUB_TOKEN: 'builtin-fixture',
    FACTORY_MEDIA_TOKEN: '',
    FACTORY_GH_PATH: gh,
    TEST_GH_MODE: ghMode,
    GITHUB_OUTPUT: path.join(f.root, 'outputs'),
  };
  const script = path.resolve(
    import.meta.dirname,
    '../publish-visual-report.mjs',
  );
  const invoke = (mode, extraEnv = {}) =>
    exec(
      process.execPath,
      [
        script,
        mode,
        '--run-id',
        String(runId),
        '--source',
        path.join(f.root, 'source.json'),
        '--artifacts',
        f.artifacts,
        '--output',
        f.output,
      ],
      { env: { ...env, ...extraEnv }, timeout: 20_000 },
    );
  await invoke('select');
  await invoke('prepare');
  return {
    ...f,
    calls,
    comments,
    invoke,
    setPR: (value) => {
      currentPR = value;
    },
  };
}

test('without a media secret, publishes/updates only its own artifact comment', async (t) => {
  const f = await publisherFixture(t, 'success');
  await f.invoke('publish');
  await f.invoke('publish');
  assert.equal(f.comments.length, 2);
  assert.match(f.comments[1].body, /FACTORY_MEDIA_TOKEN/);
  assert.equal(f.comments[0].body, 'Human note that must never be edited');
});

for (const mode of ['success', 'posted-but-error']) {
  test(`native ${mode} is idempotent and replaces only the artifact fallback`, async (t) => {
    const f = await publisherFixture(t, mode);
    await f.invoke('publish');
    await f.invoke('publish', { FACTORY_MEDIA_TOKEN: 'native-fixture' });
    await f.invoke('publish', { FACTORY_MEDIA_TOKEN: 'native-fixture' });
    assert.equal(f.comments.length, 2);
    assert.equal(f.comments[0].body, 'Human note that must never be edited');
    assert.match(f.comments[1].body, /factory-visual-mode:inline/);
  });
}

test('a new attempt of the same task run gets a new visual report', async (t) => {
  const f = await publisherFixture(t, 'success');
  await f.invoke('publish', { FACTORY_MEDIA_TOKEN: 'native-fixture' });
  const planPath = path.join(f.output, 'publication.json');
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  plan.runAttempt = 2;
  writeFileSync(planPath, JSON.stringify(plan));
  await f.invoke('publish', { FACTORY_MEDIA_TOKEN: 'native-fixture' });
  assert.equal(f.comments.length, 3);
  assert.match(f.comments[1].body, /factory-visual-report:123:1/);
  assert.match(f.comments[2].body, /factory-visual-report:123:2/);
});

test('two failed attachment attempts fall back to an artifact comment without failing delivery', async (t) => {
  const f = await publisherFixture(t, 'fail');
  const result = await f.invoke('publish', {
    FACTORY_MEDIA_TOKEN: 'native-fixture',
  });
  assert.match(result.stderr, /attempt 2 failed/);
  assert.equal(f.comments.length, 2);
  assert.match(f.comments[1].body, /上传失败/);
});

test('a changed PR head between collection and publication prevents stale media posting', async (t) => {
  const f = await publisherFixture(t, 'success');
  f.setPR({ ...pr, head: { ...pr.head, sha: 'b'.repeat(40) } });
  await f.invoke('publish', { FACTORY_MEDIA_TOKEN: 'native-fixture' });
  assert.equal(f.comments.length, 1);
});

test('media workflow isolates the token from QA/application execution and permits replay by run ID', () => {
  const workflow = readFileSync(
    path.resolve(
      import.meta.dirname,
      '../../workflows/publish-visual-report.yml',
    ),
    'utf8',
  );
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /repository.default_branch/);
  assert.doesNotMatch(
    workflow,
    /pnpm |npm install|pull_request.head|workflow_run.head_sha/,
  );
  const beforePublish = workflow.split('- name: Publish PR screenshots')[0];
  assert.doesNotMatch(beforePublish, /FACTORY_MEDIA_TOKEN: \$\{\{ secrets/);
  assert.match(workflow, /continue-on-error: true/);
  const publisher = readFileSync(
    path.resolve(import.meta.dirname, '../publish-pr.mjs'),
    'utf8',
  );
  assert.match(publisher, /agent-head-sha/);
});

test('dispatch before continuation completion waits and then publishes exactly once', async (t) => {
  const f = await publisherFixture(t, 'success', 1);
  assert.ok(
    f.calls.some((call) => call.route === '/actions/runs/123/attempts/1'),
  );
  await f.invoke('publish', { FACTORY_MEDIA_TOKEN: 'native-fixture' });
  await f.invoke('publish', { FACTORY_MEDIA_TOKEN: 'native-fixture' });
  assert.equal(f.comments.length, 2);
  assert.match(f.comments[1].body, /factory-visual-report:123:1/);
});

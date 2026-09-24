import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { selectHubArtifact, bindHubArtifact, assertDeployed, hostedApplicationUrl } from '../hub-smoke.mjs';

const repository = 'gchust/nb3-factory';
const run = {id:31,run_attempt:2,path:'.github/workflows/code-agent-task.yml',head_repository:{full_name:repository},event:'issues',status:'completed',conclusion:'success'};
const jobs = [{name:'verify-final',conclusion:'success',started_at:'2026-01-01T01:00:00Z',completed_at:'2026-01-01T01:10:00Z'}, {name:'publish',conclusion:'success'}];
const artifact = {id:45,name:'factory-dist-7',created_at:'2026-01-01T01:05:00Z',expired:false};
const source = selectHubArtifact(run,jobs,[artifact],repository,7,2);
const metadata = {repository,issue:{number:7},run:{id:31,attempt:2},workBranch:'agent/issue-7',task:{targetBranch:'develop'}};
const pull = {number:9,head:{repo:{full_name:repository},ref:metadata.workBranch,sha:'a'.repeat(40)},base:{ref:'develop'},body:`<!-- agent-head-sha: ${'a'.repeat(40)} -->\n<!-- agent-issue: 7 -->\n- [GitHub Actions 运行记录](${source.runUrl})`};
test('selects only the exact final job artifact and binds the immutable delivered code', () => {
  assert.equal(source.artifactId,45);
  assert.equal(bindHubArtifact(source,metadata,pull).headSha,'a'.repeat(40));
});
for (const [label,changed] of [['old attempt',{created_at:'2026-01-01T00:00:00Z'}],['expired',{expired:true}],['wrong issue',{name:'factory-dist-8'}]]) {
  test(`rejects ${label} artifact`, () => assert.throws(() => selectHubArtifact(run,jobs,[{...artifact,...changed}],repository,7,2)));
}
test('rejects incomplete delivery and different source attempt', () => {
  assert.throws(() => selectHubArtifact({...run,conclusion:'failure'},jobs,[artifact],repository,7,2));
  assert.throws(() => selectHubArtifact(run,jobs,[artifact],repository,7,1));
  assert.throws(() => bindHubArtifact(source,{...metadata,run:{id:31,attempt:1}},pull));
  assert.throws(() => bindHubArtifact(source,metadata,{...pull,head:{...pull.head,sha:'b'.repeat(40)}}));
});
test('accepted or wrong observed release is never a successful deployment', () => {
  const status={status:'succeeded',releaseId:'r1'}, detail={deployment:{observedReleaseId:'r1'},runtime:{hostAvailable:true,state:'running'}};
  assert.doesNotThrow(() => assertDeployed(status,detail,'r1'));
  assert.throws(() => assertDeployed({...status,status:'queued'},detail,'r1'));
  assert.throws(() => assertDeployed(status,{...detail,deployment:{observedReleaseId:'r0'}},'r1'));
  assert.throws(() => assertDeployed(status,{...detail,runtime:{hostAvailable:true,state:'stopped'}},'r1'));
});
test('isolated workflow has exact pins, no model/deployment secrets and no write permissions', () => {
  const text=readFileSync(new URL('../../workflows/hub-smoke.yml',import.meta.url),'utf8');
  assert.match(text,/artifact-ids:[\s\S]*?merge-multiple: true/);
  assert.doesNotMatch(text,/secrets\.|contents: write|issues: write|CODE_AGENT_API_KEY/);
  assert.match(text,/--template hub --dialect sqlite/);
  assert.match(text,/if: always\(\)/);
});

test('Hub startup and browser login use the explicit Hub mount, not the Host proxy', () => {
  const script = readFileSync(new URL('../hub-smoke.mjs', import.meta.url), 'utf8');
  assert.match(script, /APP_NAME: 'hub', APP_BASE_PATH: '\/hub'/);
  assert.match(script, /fetch\(`\$\{origin\}\/hub\//);
  assert.match(script, /login\(page, `\$\{origin\}\/hub\//);
  assert.doesNotMatch(script, /\$\{origin\}\/main\//);
});

// Regression: deployment/logs passed, but hostUrl "/" opened Host's 404 root.
test('counter browser entry resolves deployment basePath, not just hostUrl', () => {
  const origin = 'http://127.0.0.1:12345';
  const app = {hostUrl:'/', deployment:{basePath:'/factory-216-31'}};
  assert.equal(hostedApplicationUrl(app, origin).href, `${origin}/factory-216-31/`);
  assert.equal(hostedApplicationUrl({...app,hostUrl:origin}, origin).href, `${origin}/factory-216-31/`);
  assert.equal(hostedApplicationUrl({...app,hostUrl:`${origin}/host`}, origin).href, `${origin}/host/factory-216-31/`);
  assert.equal(hostedApplicationUrl({...app,deployment:{basePath:'factory-216-31/'}}, origin).href, `${origin}/factory-216-31/`);
  for (const basePath of [undefined, '', '/', '../hub', '//other.example', 'http://other.example']) {
    assert.throws(() => hostedApplicationUrl({...app,deployment:{basePath}}, origin));
  }
  assert.throws(() => hostedApplicationUrl({...app,hostUrl:'http://127.0.0.1:12346'}, origin));
  assert.throws(() => hostedApplicationUrl({...app,hostUrl:'https://example.com'}, origin));
  const script = readFileSync(new URL('../hub-smoke.mjs', import.meta.url), 'utf8');
  assert.match(script, /const target = hostedApplicationUrl\(detail, origin\)/);
  assert.match(script, /await login\(counter, target.href, password\)/);
});

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import { historyRequest, selectReplayHistory, bindReplayHistory } from '../replay-review-history.mjs';
const repository='owner/factory', request={runId:200,attempt:2};
const run={id:200,run_attempt:2,path:'.github/workflows/replay-build-review.yml',status:'completed',event:'issue_comment',head_repository:{full_name:repository}};
const job={id:77,name:'review',conclusion:'success',started_at:'2026-01-01T00:01:00Z',completed_at:'2026-01-01T00:05:00Z',steps:[{name:'Assess modules and persist evidence checkpoints',started_at:'2026-01-01T00:02:00Z',conclusion:'success'}]};
const artifact={id:88,name:'factory-build-review-200-2',created_at:'2026-01-01T00:04:00Z',expired:false};
const select=(r=run,j=[job],a=[artifact])=>selectReplayHistory(r,j,a,repository,request);
const binding={repository,issue:12,runId:100,attempt:1,publicationAttempt:2,baseSha:'a'.repeat(40),patchHash:'b'.repeat(64)};
const original={id:100,path:'.github/workflows/code-agent-task.yml',head_repository:{full_name:repository},display_title:'Factory issue #12 build 0 from 0'};
test('only an owner command on a manual Issue requests an old review archive',()=>{
  const e={repository:{owner:{login:'owner'}},issue:{labels:[{name:'factory:manual'}]},comment:{user:{login:'owner'},body:'/factory-review-history 200 2'}};
  assert.deepEqual(historyRequest(e,{}),request);
  assert.equal(historyRequest({...e,comment:{...e.comment,user:{login:'someone'}}},{}),null);
  assert.equal(historyRequest({...e,issue:{labels:[]}},{}),null);
  assert.deepEqual(historyRequest({workflow_run:{id:200,run_attempt:2}},{}),request);
});
test('archive uses the replay run for usage and keeps original publication provenance separate',()=>{
  const source=bindReplayHistory(select(),binding,original);
  assert.equal(source.runId,200);assert.equal(source.issue,12);assert.equal(source.artifacts[0].id,88);
  assert.equal(source.original.runId,100);assert.equal(source.original.attempt,1);assert.equal(source.original.publicationAttempt,2);
  assert.equal(source.artifacts[0].invocationExpected,true);
});
test('foreign, stale, ambiguous, missing and expired review archives do not become current evidence',()=>{
  assert.throws(()=>select({...run,run_attempt:1}));
  assert.throws(()=>select({...run,path:'.github/workflows/code-agent-task.yml'}));
  assert.throws(()=>select({...run,head_repository:{full_name:'other/repo'}}));
  assert.throws(()=>select(run,[job],[{...artifact,created_at:'2026-01-01T00:00:00Z'}]));
  assert.throws(()=>select(run,[job],[artifact,{...artifact,id:89}]));
  assert.throws(()=>select(run,[job],[{...artifact,expired:true}]));
  assert.throws(()=>bindReplayHistory(select(),{...binding,issue:13},original));
  assert.throws(()=>bindReplayHistory(select(),binding,{...original,id:99}));
  assert.equal(select(run,[{...job,conclusion:'skipped'}]),null);
  assert.equal(select(run,[{...job,conclusion:'failure'}]).runId,200);
});
test('publisher does not install/invoke a model and reports upload failure without rebuilding',()=>{
  const text=readFileSync(new URL('../../workflows/publish-build-review-history.yml',import.meta.url),'utf8');
  assert.doesNotMatch(text,/secrets\.|run-agent|install-agent|pnpm install|runBuildReview/);
  assert.match(text,/ref: \$\{\{ github.event.repository.default_branch \}\}/);
  assert.match(text,/artifact-ids:[\s\S]*merge-multiple: true/);
  assert.match(text,/if: always\(\) && steps.pack.outputs.issue != ''/);
  assert.match(text,/group: factory-agent-history/);
  const replay=readFileSync(new URL('../replay-build-review.mjs',import.meta.url),'utf8');
  assert.match(replay,/agent-review\.jsonl\.invocation\.json/);
  assert.ok(replay.indexOf('rmSync(path.join(artifacts') < replay.indexOf('const result = await runBuildReview'));
});

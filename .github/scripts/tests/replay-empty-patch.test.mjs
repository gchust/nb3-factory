import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const workflow = readFileSync(new URL('../../workflows/replay-build-review.yml', import.meta.url), 'utf8');
const match = workflow.match(/- name: Apply the sealed candidate\n        run: \|\n([\s\S]*?)\n      - name: Restore original source package snapshot/);
assert.ok(match, 'Exercise the actual patch step before frozen source restoration');
const command = match[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');

for (const kind of ['empty', 'valid', 'malformed', 'missing', 'symlink']) {
  test(`review replay preserves exact pinned HEAD and handles ${kind} patch honestly`, t => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'replay-empty-'));
    t.after(() => rmSync(root, {recursive:true,force:true}));
    const workspace=path.join(root,'workspace');mkdirSync(workspace);
    const git = args => execFileSync('git', args, {cwd:workspace,encoding:'utf8',stdio:['ignore','pipe','pipe']});
    git(['init','--initial-branch=main']);
    git(['config','user.name','Factory Test']);git(['config','user.email','factory@example.invalid']);
    writeFileSync(path.join(workspace,'app.txt'),'before\n');git(['add','.']);git(['commit','-m','Pinned candidate']);
    const head=git(['rev-parse','HEAD']);
    const patch=path.join(root,'input/agent/agent.patch');mkdirSync(path.dirname(patch),{recursive:true});
    if(kind==='empty')writeFileSync(patch,'');
    if(kind==='valid') {
      writeFileSync(path.join(workspace,'app.txt'),'after\n');
      writeFileSync(patch,git(['diff']));git(['checkout','--','app.txt']);
    }
    if(kind==='malformed')writeFileSync(patch,'not a git patch');
    if(kind==='symlink') {writeFileSync(path.join(root,'empty'),'');symlinkSync(path.join(root,'empty'),patch);}
    const result=spawnSync('bash',['-e','-o','pipefail','-c',command],{cwd:root,encoding:'utf8'});
    assert.equal(result.status===0, ['empty','valid'].includes(kind), result.stderr);
    assert.equal(git(['rev-parse','HEAD']),head);
    assert.equal(readFileSync(path.join(workspace,'app.txt'),'utf8'),kind==='valid'?'after\n':'before\n');
    assert.equal(git(['diff','--cached','--name-only']).trim(),kind==='valid'?'app.txt':'');
  });
}

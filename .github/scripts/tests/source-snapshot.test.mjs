import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { hash, verifyIntegrity, validateSnapshot, validateDescriptor, loadSnapshot, snapshotServer, unpackPackages } from '../source-snapshot.mjs';
import { copySourceApplication, sourceDescriptor } from '../source-candidate.mjs';
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'snapshot-test-')); t.after(() => rmSync(root, { recursive:true, force:true }));
  mkdirSync(path.join(root,'packages'));
  const packages = ['@nocobase/create-app','@nocobase/app-template-default'].map((name,i) => {
    const bytes=Buffer.from(`safe package ${i}`), sha256=hash(bytes), file=`packages/${sha256}.tgz`;
    writeFileSync(path.join(root,file), bytes);
    return {name,version:'1.0.0-beta.1',file,sha256,manifest:{name,version:'1.0.0-beta.1',dist:{integrity:`sha512-${createHash('sha512').update(bytes).digest('base64')}`}}};
  });
  const snapshot={version:1,source:{repository:'nocobase/nocobase3',sha:'a'.repeat(40)},packages};
  writeFileSync(path.join(root,'manifest.json'),JSON.stringify(snapshot));
  return {root,snapshot};
}
test('snapshot pins every package and refuses corrupt bytes or version collisions',t=>{
  const {root,snapshot}=fixture(t); assert.deepEqual(loadSnapshot(root),snapshot);
  assert.throws(()=>validateSnapshot({...snapshot,packages:[...snapshot.packages,snapshot.packages[0]]}));
  writeFileSync(path.join(root,snapshot.packages[0].file),'changed'); assert.throws(()=>loadSnapshot(root));
});
test('package checks use the strongest reported integrity',()=>{
  const bytes=Buffer.from('published'); const dist={integrity:`sha512-${createHash('sha512').update(bytes).digest('base64')}`,shasum:'a'.repeat(40)};
  assert.doesNotThrow(()=>verifyIntegrity(bytes,dist)); assert.throws(()=>verifyIntegrity(Buffer.from('different'),dist)); assert.throws(()=>verifyIntegrity(bytes,{}));
});
test('source descriptors cannot redirect a worker to another release/repository or source',()=>{
  const value=sourceDescriptor({repository:'gchust/nb3-factory',sourceSha:'a'.repeat(40),runId:123,attempt:1},Buffer.from('bundle'));
  assert.equal(validateDescriptor(value,value.repository),value);
  assert.throws(()=>validateDescriptor({...value,url:'https://example.com/unknown'},value.repository));
  assert.throws(()=>validateDescriptor({...value,sourceSha:'b'.repeat(40)},value.repository));
  assert.throws(()=>validateDescriptor(value,'other/repo'));
});
test('read-only registry preserves pinned metadata/tarballs and never falls back for NocoBase',async t=>{
  const {root,snapshot}=fixture(t); const server=snapshotServer(root);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const pack=await (await fetch(`${base}/@nocobase%2Fcreate-app`)).json();assert.equal(pack['dist-tags'].latest,'1.0.0-beta.1');
  assert.equal((await fetch(`${base}/@nocobase/create-app/1.0.0-beta.1`)).status,200);
  assert.equal((await fetch(`${base}/@nocobase/create-app/99.0.0`)).status,404);
  assert.equal((await fetch(`${base}/@nocobase/unknown`)).status,404);
  assert.equal((await fetch(`${base}/@nocobase/create-app`,{method:'PUT'})).status,405);
  const external=await fetch(`${base}/react`,{redirect:'manual'}); assert.equal(external.status,302);assert.equal(external.headers.get('location'),'https://registry.npmjs.org/react');
  const file=await fetch(`${base}/snapshot/${snapshot.packages[0].sha256}.tgz`);assert.equal(hash(Buffer.from(await file.arrayBuffer())),snapshot.packages[0].sha256);
});
test('portable package archive checks outer digest, exact entry names, and inner files',t=>{
  const {root}=fixture(t);const tar=path.join(root,'bundle.tar.gz');execFileSync('tar',['-czf',tar,'-C',root,'manifest.json','packages']);
  const digest=hash(readFileSync(tar));const restored=path.join(root,'restored');assert.equal(unpackPackages(tar,restored,digest).packages.length,2);
  assert.throws(()=>unpackPackages(tar,path.join(root,'bad'),'0'.repeat(64)));
  writeFileSync(path.join(root,'secret.env'),'not an allowed export');const bad=path.join(root,'bad.tar.gz');execFileSync('tar',['-czf',bad,'-C',root,'secret.env']);
  assert.throws(()=>unpackPackages(bad,path.join(root,'bad2'),hash(readFileSync(bad))));
});
test('copying an application excludes runtime state and credentials but keeps source',t=>{
  const {root}=fixture(t);const app=path.join(root,'app');mkdirSync(path.join(app,'server'),{recursive:true});
  for(const name of ['config.yml','.env','.env.local','server/app.ts','package.json'])writeFileSync(path.join(app,name),'source');
  const out=path.join(root,'safe');copySourceApplication(app,out);assert.equal(readFileSync(path.join(out,'server/app.ts'),'utf8'),'source');
  assert.throws(()=>readFileSync(path.join(out,'config.yml')));assert.throws(()=>readFileSync(path.join(out,'.env.local')));
});

test('missing selected source descriptor fails before a network request, ordinary tasks are unchanged', t => {
  const { root } = fixture(t);
  const task = path.join(root, 'task.json');
  writeFileSync(task, JSON.stringify({ task: { targetBranch: 'develop' } }));
  const script = path.resolve(import.meta.dirname, '../source-snapshot.mjs');
  assert.doesNotThrow(() => execFileSync(process.execPath, [script, 'restore', root, task]));
  writeFileSync(task, JSON.stringify({ task: { targetBranch: `factory-baseline/source-${'a'.repeat(12)}-123-1` } }));
  assert.throws(() => execFileSync(process.execPath, [script, 'restore', root, task], { stdio: 'pipe' }), /descriptor is missing/);
});

test('portable publishing requires two verified jobs and keeps application execution away from writes', () => {
  const workflow = readFileSync(path.resolve(import.meta.dirname, '../../workflows/source-baseline.yml'), 'utf8');
  const publish = workflow.split('\n  publish:')[1];
  assert.match(publish, /needs: \[source-baseline, portable\]/);
  assert.match(publish, /github.actor == github.repository_owner/);
  assert.doesNotMatch(publish, /pnpm (?:install|build|start)|source-config-check/);
  assert.match(publish, /publish-source-baseline.sh/);
  const script = readFileSync(path.resolve(import.meta.dirname, '../publish-source-baseline.sh'), 'utf8');
  assert.match(script, /factory-baseline\/source-/);
  assert.match(script, /FACTORY_CONTROL_SHA:\.github/);
  assert.doesNotMatch(script, /--clobber|refs\/heads\/develop/);
});

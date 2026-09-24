import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const compatibility = readFileSync(new URL('../browser-worker-compat.js', import.meta.url), 'utf8');
const guarded = '(function _agentBrowserInstallDomainFilter() { globalThis.guard = true; })(["127.0.0.1"], "http://127.0.0.1/worker.js");\nawait import("http://127.0.0.1/worker.js");\n';
function context() {
  const result = vm.createContext({ Blob, MessageEvent });
  vm.runInContext(compatibility, result);
  return result;
}

test('only the known guarded module bootstrap is buffered; original guard is intact', async () => {
  const ctx = context();
  ctx.source = guarded;
  const blob = vm.runInContext('new Blob([source], {type:"application/javascript"})', ctx);
  const transformed = await blob.text();
  assert.ok(transformed.includes(guarded), 'domain filter and import are preserved byte for byte');
  assert.ok(transformed.indexOf('addEventListener') < transformed.indexOf(guarded));
  assert.ok(transformed.indexOf('removeEventListener') > transformed.indexOf(guarded));
  assert.equal(blob.type, 'application/javascript');
  assert.ok(blob instanceof Blob);
});

test('ordinary, multipart, classic and unknown worker blobs retain exact bytes', async () => {
  const ctx = context();
  for (const source of ['ordinary', 'await import("example");\n', guarded.replace('await import(', 'importScripts('), guarded.replace('_agentBrowserInstallDomainFilter', 'anotherFunction')]) {
    ctx.source = source;
    assert.equal(await vm.runInContext('new Blob([source]).text()', ctx), source);
  }
  ctx.source = guarded;
  assert.equal(await vm.runInContext('new Blob([source, "tail"]).text()', ctx), guarded + 'tail');
  assert.throws(() => vm.runInContext('Blob([source])', ctx));
  assert.equal(await vm.runInContext('(new (class extends Blob {})(["subclass"])).text()', ctx), 'subclass');
});

for (const failImport of [false, true]) test(`events await module initialization, import failure=${failImport}`, async () => {
  const ctx = context(); ctx.source = guarded;
  const transformed = await vm.runInContext('new Blob([source]).text()', ctx);
  const target = new EventTarget();
  const delivered = [];
  let finish;
  ctx.addEventListener = target.addEventListener.bind(target);
  ctx.removeEventListener = target.removeEventListener.bind(target);
  ctx.dispatchEvent = target.dispatchEvent.bind(target);
  ctx.importModule = () => new Promise((resolve, reject) => {
    finish = () => {
      if (failImport) reject(new Error('module failed'));
      else {
        for (const type of ['message','messageerror','connect']) target.addEventListener(type, event => delivered.push(event));
        resolve();
      }
    };
  });
  const running = vm.runInContext('(async()=>{' + transformed.replace('await import("http://127.0.0.1/worker.js");', 'await importModule();') + '})()', ctx);
  assert.equal(ctx.guard, true, 'guard installed before import');
  const first = new MessageEvent('message', {data: { order: 1, buffer: new Uint8Array([1,2,3]).buffer }});
  const second = new MessageEvent('messageerror');
  const channel = new MessageChannel();
  const third = new MessageEvent('connect', {ports:[channel.port1]});
  for (const event of [first,second,third]) target.dispatchEvent(event);
  assert.equal(delivered.length, 0);
  finish();
  if (failImport) {await assert.rejects(running, /module failed/); assert.equal(delivered.length, 0);}
  else {
    await running;
    assert.deepEqual(delivered.map(e=>e.type), ['message','messageerror','connect']);
    assert.equal(delivered[2].ports[0], channel.port1);
    assert.equal(delivered[0].data.buffer, first.data.buffer);
    const next = new Event('message'); target.dispatchEvent(next);
    assert.equal(delivered.length, 4); assert.equal(delivered[3], next);
  }
  channel.port1.close(); channel.port2.close();
});

test('preflight and actual QA both install the trusted shim without dropping the guard', () => {
  const preflight = readFileSync(new URL('../browser-preflight.mjs', import.meta.url), 'utf8');
  const qa = readFileSync(new URL('../browser-acceptance.sh', import.meta.url), 'utf8');
  for (const source of [preflight,qa]) {
    assert.match(source, /AGENT_BROWSER_ALLOWED_DOMAINS/);
    assert.match(source, /AGENT_BROWSER_INIT_SCRIPTS.*browser-worker-compat\.js/);
  }
});

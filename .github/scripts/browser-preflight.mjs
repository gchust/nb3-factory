import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { accessSync, constants, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execute = promisify(execFile);

// agent-browser 0.36.0 may try Chrome startup three times (30s each).
// Only cold startup gets this allowance; navigation/interaction stay bounded.
export const PREFLIGHT_TIMEOUTS = Object.freeze({
  startup: 105_000,
  command: 20_000,
  cleanup: 5_000,
  total: 180_000,
});

// Probe the same guarded browser used by QA, not an unguarded Playwright browser.
// Missing optional capabilities are diagnostics, never a claim about app code.
export async function preflight(output, executable = 'agent-browser', timeouts = PREFLIGHT_TIMEOUTS) {
  for (const key of Object.keys(PREFLIGHT_TIMEOUTS)) {
    if (!Number.isSafeInteger(timeouts[key]) || timeouts[key] <= 0) {
      throw new Error(`Invalid browser preflight ${key} timeout`);
    }
  }
  if (timeouts.cleanup >= timeouts.total) throw new Error('Preflight total must exceed cleanup timeout');
  const started = performance.now();
  const deadline = started + timeouts.total;
  const workDeadline = deadline - timeouts.cleanup;
  let stage = 'configuration';
  let launchAttempted = false;
  mkdirSync(path.dirname(output), { recursive: true });
  const report = { version: 1, basic: false, capabilities: {}, errors: [], commands: [] };
  const env = {
    ...process.env,
    AGENT_BROWSER_CONTENT_BOUNDARIES: '1',
    AGENT_BROWSER_ALLOWED_DOMAINS: process.env.AGENT_BROWSER_ALLOWED_DOMAINS || '127.0.0.1',
    AGENT_BROWSER_MAX_OUTPUT: '50000',
    AGENT_BROWSER_NO_WEBMCP: '1',
    AGENT_BROWSER_INIT_SCRIPTS: fileURLToPath(new URL('./browser-worker-compat.js', import.meta.url)),
    AGENT_BROWSER_NAMESPACE: `nb3-preflight-${randomUUID().replaceAll('-', '').slice(0, 16)}`,
    AGENT_BROWSER_SESSION: 'preflight',
  };
  const run = async (name, budget, command, ...args) => {
    stage = name;
    const start = performance.now();
    const remaining = (name === 'cleanup' ? deadline : workDeadline) - start;
    const timeout = Math.max(0, Math.floor(Math.min(budget, remaining)));
    const record = { stage: name, command, args, timeoutMs: timeout };
    report.commands.push(record);
    let timer;
    let timedOut = false;
    try {
      if (!timeout) throw new Error('Browser preflight total budget exhausted');
      const controller = new AbortController();
      const pending = execute(command, args, {
        env, signal: controller.signal, detached: process.platform !== 'win32',
        encoding: 'utf8', maxBuffer: 100_000,
      });
      pending.child.stdin?.end();
      timer = setTimeout(() => {
        timedOut = true;
        // A JS launcher can own a native CLI child. Stop this command's group,
        // not unrelated Chrome sessions; the daemon is closed separately below.
        try {
          if (pending.child.pid && process.platform !== 'win32') {
            process.kill(-pending.child.pid, 'SIGKILL');
          }
        } catch (error) {
          if (error.code !== 'ESRCH') record.terminationError = String(error.message);
        }
        // Also stop the direct child if process groups are unavailable.
        pending.child.kill('SIGKILL');
        controller.abort();
      }, timeout);
      const result = await pending;
      record.code = 0;
      return result;
    } catch (error) {
      record.code = error.code ?? null;
      record.signal = timedOut ? 'SIGKILL' : error.signal ?? null;
      record.timedOut = timedOut;
      record.error = timedOut
        ? `Browser preflight ${name} timed out after ${timeout}ms`
        : String(error.message).slice(0, 2000);
      record.stderr = String(error.stderr ?? '').slice(-4000);
      record.stdout = String(error.stdout ?? '').slice(-4000);
      throw new Error(record.error, { cause: error });
    } finally {
      clearTimeout(timer);
      record.durationMs = Math.round(performance.now() - start);
    }
  };
  const browser = (name, ...args) => run(name, timeouts.command, executable, ...args);
  const seen = {};
  const page = `<!doctype html><title>Factory browser preflight</title>
<input id="file" type="file"><button id="action">Test interaction</button>
<a id="download" href="/download" download="factory-preflight.txt">Download</a>
<script>
const send = data => fetch('/result', {method:'POST',body:JSON.stringify(data)});
file.onchange = () => send({upload:file.files[0]?.size > 0});
action.onclick = () => send({interaction:true});
async function probe(type, blob) {
  const url = blob ? URL.createObjectURL(new Blob(['postMessage("ready")'],{type:'text/javascript'})) : '/worker.js';
  let worker;
  try {return await new Promise(resolve => {
    const timer=setTimeout(()=>resolve(false),3000);
    worker=new Worker(url,{type});
    worker.onmessage=()=>{clearTimeout(timer);resolve(true)};
    worker.onerror=()=>{clearTimeout(timer);resolve(false)};
  })} catch {return false} finally {worker?.terminate();if(blob)URL.revokeObjectURL(url)}
}
async function requestProbe(blob) {
  const script = "onmessage=async e=>{let blocked=false;try{await fetch('http://localhost:'+new URL(location.href).port+'/forbidden')}catch(error){blocked=error.name==='SecurityError'};postMessage({order:e.data.order,bytes:Array.from(new Uint8Array(e.data.buffer)),blocked})}";
  // The generated script uses the original same-origin URL, not blob location.
  const code = script.replace("new URL(location.href).port", JSON.stringify(location.port));
  const url=blob?URL.createObjectURL(new Blob([code],{type:'text/javascript'})):'/request-worker.js';
  let worker;
  try {return await new Promise(resolve=>{
    const replies=[];
    const timer=setTimeout(()=>resolve(false),3000);
    worker=new Worker(url,{type:'module'});
    worker.onerror=()=>{clearTimeout(timer);resolve(false)};
    worker.onmessage=e=>{
      replies.push(e.data);
      if(replies.length===2)setTimeout(()=>{clearTimeout(timer);resolve(replies.length===2 && replies.every((r,i)=>r.order===i+1 && r.bytes.join(',')==='1,2,3' && r.blocked===true))},50);
    };
    for(const order of [1,2]){const buffer=new Uint8Array([1,2,3]).buffer;worker.postMessage({order,buffer},[buffer]);}
  })}catch{return false}finally{worker?.terminate();if(blob)URL.revokeObjectURL(url)}
}
(async()=>send({capabilities:{classicWorker:await probe('classic',false),moduleWorker:await probe('module',false),moduleBlobWorker:await probe('module',true),moduleWorkerRequest:await requestProbe(false),moduleBlobWorkerRequest:await requestProbe(true),pdfViewerEnabled:navigator.pdfViewerEnabled===true}}))();
</script>`;
  const server = createServer((request, response) => {
    if (request.url === '/result') {
      let body = '';
      request.on('data', (chunk) => { body += chunk; if (body.length > 4096) request.destroy(); });
      request.on('end', () => {
        try { Object.assign(seen, JSON.parse(body)); response.end('ok'); }
        catch { response.writeHead(400).end(); }
      });
    } else if (request.url === '/request-worker.js') {
      response.setHeader('Content-Type', 'text/javascript');
      // Deliberately delay the import to make the lost-first-message race repeatable.
      setTimeout(() => response.end(`onmessage=async e=>{let blocked=false;try{await fetch('http://localhost:${server.address().port}/forbidden')}catch(error){blocked=error.name==='SecurityError'};postMessage({order:e.data.order,bytes:Array.from(new Uint8Array(e.data.buffer)),blocked})}`), 150);
    } else if (request.url === '/forbidden') {
      seen.forbidden = true;
      response.end('should never be reached');
    } else if (request.url === '/worker.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end('postMessage("ready")');
    } else if (request.url === '/download') {
      response.setHeader('Content-Disposition', 'attachment; filename="factory-preflight.txt"');
      response.end('Factory preflight download\n');
    } else {
      response.setHeader('Content-Type', 'text/html');
      response.end(page);
    }
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    report.browserVersion = (await browser('version', '--version')).stdout.trim();
    if (env.AGENT_BROWSER_EXECUTABLE_PATH) {
      stage = 'chrome-version';
      accessSync(env.AGENT_BROWSER_EXECUTABLE_PATH, constants.X_OK);
      report.chromeVersion = (await run(stage, timeouts.command,
        env.AGENT_BROWSER_EXECUTABLE_PATH, '--version')).stdout.trim();
    }
    launchAttempted = true;
    // No URL: launch on about:blank without navigating or running the fixture.
    await run('startup', timeouts.startup, executable, 'open');
    await browser('ready', 'get', 'url');
    const address = server.address();
    await browser('navigation', 'open', `http://127.0.0.1:${address.port}/`);
    await browser('snapshot', 'snapshot', '-i');
    const file = path.join(path.dirname(output), 'preflight-input.txt');
    writeFileSync(file, 'Factory upload sample\n');
    await browser('upload', 'upload', '#file', file);
    await browser('interaction', 'click', '#action');
    const downloaded = path.join(path.dirname(output), 'preflight-download.txt');
    await browser('download', 'download', '#download', downloaded);
    report.download = readFileSync(downloaded, 'utf8') === 'Factory preflight download\n';
    stage = 'capabilities';
    for (let i = 0; i < 100 && !(seen.capabilities && seen.interaction && seen.upload); i++) {
      const remaining = workDeadline - performance.now();
      if (remaining <= 0) throw new Error('Browser preflight total budget exhausted');
      await sleep(Math.min(100, remaining));
    }
    report.capabilities = seen.capabilities || {};
    report.capabilities.workerNetworkLeak = seen.forbidden === true;
    report.basic = seen.interaction === true && seen.upload === true && report.download && Boolean(seen.capabilities);
    if (!report.basic) throw new Error('Browser navigation, interaction, upload/download or capability probe did not complete.');
  } catch (error) {
    report.failedStage = stage;
    report.errors.push(String(error.message).slice(0, 2000));
  } finally {
    // Preserve the failed phase before attempting independently bounded cleanup.
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    if (launchAttempted) {
      await run('cleanup', timeouts.cleanup, executable, 'close').catch(() => {});
    }
    report.durationMs = Math.round(performance.now() - started);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Usage: browser-preflight.mjs <report.json>');
  const report = await preflight(path.resolve(process.argv[2]), process.env.FACTORY_REAL_AGENT_BROWSER || 'agent-browser');
  if (!report.basic) { console.error(`Factory browser preflight failed at ${report.failedStage}: ${report.errors.join('; ')}. No application repair requested.`); process.exit(20); }
  console.log('Browser preflight passed; optional capabilities:', JSON.stringify(report.capabilities));
}

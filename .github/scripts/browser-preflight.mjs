import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const execute = promisify(execFile);

// Probe the same guarded browser used by QA, not an unguarded Playwright browser.
// Missing optional capabilities are diagnostics, never a claim about app code.
export async function preflight(output, executable = 'agent-browser') {
  mkdirSync(path.dirname(output), { recursive: true });
  const report = { version: 1, basic: false, capabilities: {}, errors: [] };
  const env = {
    ...process.env,
    AGENT_BROWSER_CONTENT_BOUNDARIES: '1',
    AGENT_BROWSER_ALLOWED_DOMAINS: process.env.AGENT_BROWSER_ALLOWED_DOMAINS || '127.0.0.1',
    AGENT_BROWSER_MAX_OUTPUT: '50000',
    AGENT_BROWSER_NO_WEBMCP: '1',
    AGENT_BROWSER_NAMESPACE: `nb3-preflight-${process.env.GITHUB_RUN_ID || process.pid}`,
    AGENT_BROWSER_SESSION: 'preflight',
  };
  const run = (...args) => execute(executable, args, { env, timeout: 20_000, maxBuffer: 100_000 });
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
(async()=>send({capabilities:{classicWorker:await probe('classic',false),moduleWorker:await probe('module',false),moduleBlobWorker:await probe('module',true),pdfViewerEnabled:navigator.pdfViewerEnabled===true}}))();
</script>`;
  const server = createServer((request, response) => {
    if (request.url === '/result') {
      let body = '';
      request.on('data', (chunk) => { body += chunk; if (body.length > 4096) request.destroy(); });
      request.on('end', () => {
        try { Object.assign(seen, JSON.parse(body)); response.end('ok'); }
        catch { response.writeHead(400).end(); }
      });
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
    report.browserVersion = (await run('--version')).stdout.trim();
    const address = server.address();
    await run('open', `http://127.0.0.1:${address.port}/`);
    await run('snapshot', '-i');
    const file = path.join(path.dirname(output), 'preflight-input.txt');
    writeFileSync(file, 'Factory upload sample\n');
    await run('upload', '#file', file);
    await run('click', '#action');
    const downloaded = path.join(path.dirname(output), 'preflight-download.txt');
    await run('download', '#download', downloaded);
    report.download = readFileSync(downloaded, 'utf8') === 'Factory preflight download\n';
    for (let i = 0; i < 100 && !(seen.capabilities && seen.interaction && seen.upload); i++) await sleep(100);
    report.capabilities = seen.capabilities || {};
    report.basic = seen.interaction === true && seen.upload === true && report.download && Boolean(seen.capabilities);
    if (!report.basic) report.errors.push('Browser navigation, interaction, upload/download or capability probe did not complete.');
  } catch (error) {
    report.errors.push(String(error.message).slice(0, 2000));
  } finally {
    await run('close', '--all').catch(() => {});
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Usage: browser-preflight.mjs <report.json>');
  const report = await preflight(path.resolve(process.argv[2]), process.env.FACTORY_REAL_AGENT_BROWSER || 'agent-browser');
  if (!report.basic) { console.error('Factory browser preflight failed. No application repair requested.'); process.exit(20); }
  console.log('Browser preflight passed; optional capabilities:', JSON.stringify(report.capabilities));
}

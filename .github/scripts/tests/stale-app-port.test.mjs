import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const script = path.resolve(import.meta.dirname, '..', 'stop-stale-app.sh');

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForListener(port) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await canConnect(port)) return;
    await delay(100);
  }
  throw new Error(`Nothing listened on port ${port}.`);
}

// A held socket whose command line matches the application, as `pnpm dev` produces.
function startApplicationListener(port) {
  return spawn(
    process.execPath,
    [
      '-e',
      `require('node:http').createServer((_request, response) => response.end('held')).listen(${port}, '127.0.0.1');`,
      'server/standalone.ts',
    ],
    { stdio: 'ignore' },
  );
}

// A held socket whose command line belongs to something else entirely.
function startForeignListener(port) {
  return spawn(
    process.execPath,
    [
      '-e',
      `require('node:http').createServer((_request, response) => response.end('held')).listen(${port}, '127.0.0.1');`,
    ],
    { stdio: 'ignore' },
  );
}

const isAlive = (child) => child.exitCode === null && child.signalCode === null;

const stop = (child) => {
  if (isAlive(child)) child.kill('SIGKILL');
};

test('an application left running by an earlier step is stopped and its port freed', async () => {
  const port = 13437;
  const child = startApplicationListener(port);
  try {
    await waitForListener(port);
    const result = spawnSync('bash', [script, String(port)], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Stopping application processes/);
    assert.equal(await canConnect(port), false);
    await delay(200);
    assert.equal(isAlive(child), false);
  } finally {
    stop(child);
  }
});

test('a port held by something else is reported instead of killed', async () => {
  const port = 13438;
  const child = startForeignListener(port);
  try {
    await waitForListener(port);
    const result = spawnSync('bash', [script, String(port)], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /is not this application/);
    assert.match(result.stderr, new RegExp(String(port)));
    assert.equal(isAlive(child), true);
    assert.equal(await canConnect(port), true);
  } finally {
    stop(child);
  }
});

test('a free application port is left alone', () => {
  const output = execFileSync('bash', [script, '13439'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(output, '');
});

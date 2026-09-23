import { spawnSync } from 'node:child_process';
import { isIP } from 'node:net';
import { resolve } from 'node:path';

const url = new URL(process.env.PREVIEW_URL);
if (url.protocol !== 'https:') throw new Error('Preview requires HTTPS');
const output = resolve(process.env.RUNNER_TEMP, 'preview-public.html');

// How long the check keeps asking public DNS, and how long it waits between
// questions.
//
// The record it asks about is created by a timer on the preview host —
// `cloudflare-sync.py` runs at most once a minute — so it can be a minute behind
// the container this check follows. Until it exists, the zone's wildcard answers
// for the name and points at a host that never completes a connection: that is
// what put forty seconds of `Failed to connect` in every deploy log, and a live
// preview was one probe away from being reported unreachable (PR #159/#166,
// 2026-09-21/22). Asking once, immediately, is what made the answer a coin toss.
const budgetMs = numberFromEnv('PREVIEW_PUBLIC_CHECK_BUDGET_MS', 120_000);
const intervalMs = numberFromEnv('PREVIEW_PUBLIC_CHECK_INTERVAL_MS', 5_000);

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * One HTTPS request for this preview, optionally pinned to one address.
 *
 * Nothing is pinned when no address is given: that probe is the runner's own
 * resolver, the other independent way to learn where the name points. When an
 * address is given, `--resolve` replaces only the lookup — the hostname is still
 * what is requested, so TLS and HTTP routing verify the public host and
 * certificates are never disabled.
 */
const probe = (address) => {
  const args = [
    '--fail',
    '--show-error',
    '--silent',
    '--location',
    // IPv4 only: this name is published with AAAA records as well, and nothing
    // here depends on IPv6 — the addresses below are A records.
    '--ipv4',
    '--connect-timeout',
    '5',
    '--max-time',
    '20',
    '--output',
    output,
  ];
  if (address) args.push('--resolve', `${url.hostname}:443:${address}`);
  args.push(url.href);
  return spawnSync('curl', args, { stdio: 'inherit' }).status === 0;
};

/** The A records public DNS answers with, over authenticated HTTPS. */
async function publicAddresses() {
  const query = new URL('https://cloudflare-dns.com/dns-query');
  query.searchParams.set('name', url.hostname);
  query.searchParams.set('type', 'A');
  const response = await fetch(query, {
    headers: { accept: 'application/dns-json' },
    signal: globalThis.AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`Public DNS query failed: ${response.status}`);
  const data = await response.json();
  return [
    ...new Set(
      (data.Answer ?? [])
        .filter((answer) => answer.type === 1 && isIP(answer.data) === 4)
        .map((answer) => answer.data),
    ),
  ];
}

const deadline = Date.now() + budgetMs;
let answers = [];
let asked = 0;

for (;;) {
  try {
    answers = await publicAddresses();
    asked += 1;
    console.log(
      `Public DNS addresses for ${url.hostname}: ${answers.join(', ') || 'none'}`,
    );
    if (answers.some(probe)) break;
  } catch (error) {
    // A runner that cannot reach the DNS service still has its own resolver, so
    // that path is taken now rather than after the whole budget has been spent
    // waiting for an answer that is not coming.
    console.error(`Public DNS query failed: ${error.message}`);
    if (probe()) break;
  }

  if (Date.now() >= deadline) {
    if (probe()) break;
    throw new Error(
      `Public preview HTTPS check failed: ${url.href} did not answer from ${
        answers.join(', ') || 'no address'
      } (${
        asked
          ? `${asked} public DNS question(s) answered`
          : 'public DNS never answered'
      })`,
    );
  }
  await sleep(Math.min(intervalMs, deadline - Date.now()));
}

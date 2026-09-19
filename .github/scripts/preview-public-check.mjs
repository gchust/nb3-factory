import { spawnSync } from 'node:child_process';
import { isIP } from 'node:net';
import { resolve } from 'node:path';

const url = new URL(process.env.PREVIEW_URL);
if (url.protocol !== 'https:') throw new Error('Preview requires HTTPS');
const output = resolve(process.env.RUNNER_TEMP, 'preview-public.html');
const probe = (address) => {
  const args = [
    '--fail',
    '--show-error',
    '--silent',
    '--location',
    '--connect-timeout',
    '10',
    '--max-time',
    '30',
    '--retry',
    '2',
    '--retry-delay',
    '5',
    '--retry-all-errors',
    '--output',
    output,
  ];
  if (address) args.push('--resolve', `${url.hostname}:443:${address}`);
  args.push(url.href);
  return spawnSync('curl', args, { stdio: 'inherit' }).status === 0;
};
if (!probe()) {
  // Query public DNS over authenticated HTTPS. Preserve the original hostname
  // for TLS/SNI and HTTP routing; never use an origin IP or disable certificates.
  const query = new URL('https://cloudflare-dns.com/dns-query');
  query.searchParams.set('name', url.hostname);
  query.searchParams.set('type', 'A');
  const response = await fetch(query, {
    headers: { accept: 'application/dns-json' },
    signal: globalThis.AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(`Public DNS query failed: ${response.status}`);
  const data = await response.json();
  const addresses = [
    ...new Set(
      (data.Answer ?? [])
        .filter((answer) => answer.type === 1 && isIP(answer.data) === 4)
        .map((answer) => answer.data),
    ),
  ];
  console.log(
    `Public DNS addresses for ${url.hostname}: ${addresses.join(', ')}`,
  );
  if (!addresses.some(probe))
    throw new Error('Public preview HTTPS check failed');
}

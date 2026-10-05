import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { controlSha } from './handoff-control.mjs';

// The bootstrap checkout is sparse, so the retrying GitHubClient in
// factory-lib.mjs is not available here; the dispatch retries inline.
const DISPATCH_RETRY_DELAYS_MS = [1000, 3000, 8000];
const DISPATCH_TIMEOUT_MS = 30_000;

// Losing this one request reports up to five hours of work as a failed run.
// /dispatches is not idempotent, so only a 429, a 5xx, a network error or a
// timeout, which GitHub most likely never acted on, is retried; any other
// refusal fails at once.
export async function dispatchContinuation(
  url,
  {
    token,
    body,
    fetcher = fetch,
    pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    delays = DISPATCH_RETRY_DELAYS_MS,
    timeoutMs = DISPATCH_TIMEOUT_MS,
  },
) {
  for (let attempt = 0; ; attempt++) {
    let failure;
    try {
      const response = await fetcher(url, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return;
      failure = new Error(
        `Failed to dispatch continuation: ${response.status} ${await response.text().catch(() => '')}`,
      );
      if (response.status !== 429 && response.status < 500) throw failure;
    } catch (error) {
      if (error === failure) throw error;
      failure ??= new Error(
        `Failed to dispatch continuation: ${error?.name === 'TimeoutError' ? `no response in ${timeoutMs} ms` : error?.message}`,
        { cause: error },
      );
    }
    if (attempt >= delays.length) throw failure;
    console.error(`${failure.message}; retrying in ${delays[attempt]} ms.`);
    await pause(delays[attempt]);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main(process.argv.slice(2));

async function main([command, ...rest]) {
  const args = parseArgs(rest);
  if (command === 'prepare') {
    const issueNumber = positiveInteger(args.issue, '--issue');
    const runId = positiveInteger(args['run-id'], '--run-id');
    const continuation = positiveInteger(
      args.continuation ?? '1',
      '--continuation',
    );
    const output = required(args.output, '--output');
    if (continuation > 1)
      throw new Error(
        'Task allows only one five-hour Handoff; stop for diagnosis.',
      );
    const sha = controlSha(process.env.FACTORY_CONTROL_SHA);
    const payload = {
      schemaVersion: 1,
      controlSha: sha,
      issueNumber,
      previousRunId: runId,
      continuation,
      phase: args.phase || 'agent',
      reason: 'runner-budget',
    };
    mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, {
      mode: 0o600,
    });
    console.log(`Prepared handoff ${continuation} for issue #${issueNumber}.`);
  } else if (command === 'dispatch') {
    const issueNumber = positiveInteger(args.issue, '--issue');
    const previousRunId = positiveInteger(
      args['previous-run-id'],
      '--previous-run-id',
    );
    const continuation = positiveInteger(
      args.continuation ?? '1',
      '--continuation',
    );
    if (continuation > 1)
      throw new Error(
        'Task allows only one five-hour Handoff; stop for diagnosis.',
      );
    const sha = controlSha(process.env.FACTORY_CONTROL_SHA);
    const token = required(process.env.GITHUB_TOKEN, 'GITHUB_TOKEN');
    const repository = required(
      process.env.GITHUB_REPOSITORY,
      'GITHUB_REPOSITORY',
    );
    const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';
    await dispatchContinuation(`${apiUrl}/repos/${repository}/dispatches`, {
      token,
      body: {
        event_type: 'code-agent-continue',
        client_payload: {
          issue_number: issueNumber,
          control_sha: sha,
          ...(process.env.BUILD_COMMENT_ID
            ? {
                build_comment_id: positiveInteger(
                  process.env.BUILD_COMMENT_ID,
                  'BUILD_COMMENT_ID',
                ),
              }
            : {}),
          previous_run_id: previousRunId,
          continuation,
        },
      },
    });
    console.log(
      `Dispatched continuation ${continuation} for issue #${issueNumber}.`,
    );
  } else {
    throw new Error('Usage: handoff.mjs <prepare|dispatch> [options]');
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '');
    const value = argv[index + 1];
    if (!key || value == null)
      throw new Error(`Invalid argument near ${argv[index]}`);
    parsed[key] = value;
  }
  return parsed;
}

function required(value, name) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function positiveInteger(value, name) {
  const parsed = Number(required(value, name));
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

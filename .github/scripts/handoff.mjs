import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

if (command === 'prepare') {
  const issueNumber = positiveInteger(args.issue, '--issue');
  const runId = positiveInteger(args['run-id'], '--run-id');
  const continuation = positiveInteger(args.continuation ?? '1', '--continuation');
  const output = required(args.output, '--output');
  const payload = {
    schemaVersion: 1,
    issueNumber,
    previousRunId: runId,
    continuation,
    phase: args.phase || 'agent',
    reason: 'runner-budget',
  };
  mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  console.log(`Prepared handoff ${continuation} for issue #${issueNumber}.`);
} else if (command === 'dispatch') {
  const issueNumber = positiveInteger(args.issue, '--issue');
  const previousRunId = positiveInteger(args['previous-run-id'], '--previous-run-id');
  const continuation = positiveInteger(args.continuation ?? '1', '--continuation');
  const token = required(process.env.GITHUB_TOKEN, 'GITHUB_TOKEN');
  const repository = required(process.env.GITHUB_REPOSITORY, 'GITHUB_REPOSITORY');
  const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';
  const response = await fetch(`${apiUrl}/repos/${repository}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      event_type: 'code-agent-continue',
      client_payload: {
        issue_number: issueNumber,
        previous_run_id: previousRunId,
        continuation,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to dispatch continuation: ${response.status} ${await response.text()}`,
    );
  }
  console.log(`Dispatched continuation ${continuation} for issue #${issueNumber}.`);
} else {
  throw new Error('Usage: handoff.mjs <prepare|dispatch> [options]');
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '');
    const value = argv[index + 1];
    if (!key || value == null) throw new Error(`Invalid argument near ${argv[index]}`);
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

// This bootstrap protocol stays with the triggering workflow. Task execution
// uses the pinned control checkout, including when adopting an older handoff.
import { appendFileSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function controlSha(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/u.test(value)) {
    throw new Error('Factory control SHA must be a full lowercase commit SHA.');
  }
  return value;
}

function continuationPayload(event) {
  const payload = event.client_payload;
  if (!payload || !['issue_number', 'previous_run_id', 'continuation'].every(
    (key) => Number.isSafeInteger(Number(payload[key])) && Number(payload[key]) > 0,
  )) throw new Error('Invalid factory continuation identity.');
  return payload;
}

function readJson(file, optional = false) {
  let stat;
  try { stat = lstatSync(file); } catch (error) {
    if (optional && error.code === 'ENOENT') return null;
    throw error;
  }
  if (!stat.isFile() || stat.size > 1_048_576) throw new Error('Invalid handoff control metadata file.');
  return JSON.parse(readFileSync(file, 'utf8'));
}

function savedControlSha(event, directory) {
  const payload = continuationPayload(event);
  if (!directory) throw new Error('A legacy continuation needs its handoff checkpoint to resolve the factory SHA.');
  const handoff = readJson(path.join(directory, 'handoff.json'));
  if (handoff?.schemaVersion !== 1 || handoff.issueNumber !== Number(payload.issue_number) ||
      handoff.previousRunId !== Number(payload.previous_run_id) ||
      handoff.continuation !== Number(payload.continuation)) {
    throw new Error('Handoff checkpoint does not match this Issue, source run and continuation.');
  }
  const pipeline = readJson(path.join(directory, 'pipeline-state.json'), true);
  const pins = [handoff.controlSha, pipeline?.controlSha]
    .filter((value) => value !== undefined).map(controlSha);
  if (pins.length === 0) {
    throw new Error('Legacy checkpoint has no recorded factory SHA; start a new build instead of silently upgrading it.');
  }
  if (pins.some((pin) => pin !== pins[0])) throw new Error('Handoff and pipeline factory SHAs disagree.');
  return pins[0];
}

export function resolveControlSha(event, currentSha, checkpoint, previousTask) {
  if (event.action !== 'code-agent-continue') return controlSha(currentSha);
  const payload = continuationPayload(event);
  if (Object.hasOwn(payload, 'control_sha')) {
    const requested = controlSha(payload.control_sha);
    // Treat the dispatch field as a hint, not permission to execute arbitrary
    // repository code with prepare's write token. Anchor it to the source run's
    // small, Actions-downloaded task artifact before checking out task scripts.
    if (previousTask?.issue?.number !== Number(payload.issue_number) ||
        previousTask.repository !== event.repository?.full_name ||
        controlSha(previousTask.controlSha) !== requested) {
      throw new Error('Continuation factory SHA does not match the source task metadata.');
    }
    return requested;
  }
  // Pre-pin runs already recorded the actual evaluator in pipeline-state.json.
  // Adopt the most recent checkpoint, not the latest default branch or a run's
  // head_sha (which only identifies GitHub's event/workflow revision).
  const sha = savedControlSha(event, checkpoint);
  console.error(`Legacy continuation: adopting checkpoint factory ${sha}.`);
  return sha;
}

export function verifyControlSha(event, selectedSha, checkpoint) {
  if (event.action !== 'code-agent-continue') throw new Error('Expected a factory continuation.');
  const selected = controlSha(selectedSha);
  const saved = savedControlSha(event, checkpoint);
  const requested = Object.hasOwn(event.client_payload, 'control_sha')
    ? controlSha(event.client_payload.control_sha) : saved;
  if (requested !== selected || saved !== selected) {
    throw new Error('Continuation factory SHA does not match the checkpoint; refusing a version change.');
  }
  return selected;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...rest] = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i]?.startsWith('--') || rest[i + 1] === undefined) throw new Error('Invalid handoff-control arguments.');
    args[rest[i].slice(2)] = rest[i + 1];
  }
  if (command === 'record') {
    const metadata = readJson(args.metadata);
    metadata.controlSha = controlSha(process.env.FACTORY_CONTROL_SHA);
    writeFileSync(args.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
    process.exit(0);
  }
  const event = readJson(args.event);
  if (command === 'resolve') {
    const sha = resolveControlSha(event, args['current-sha'], args.checkpoint,
      args['previous-task'] ? readJson(args['previous-task'], true) : null);
    appendFileSync(args.output, `sha=${sha}\n`);
    console.error(`Pinned task-chain factory: ${sha}`);
  } else if (command === 'verify') {
    const sha = verifyControlSha(event, process.env.FACTORY_CONTROL_SHA, args.checkpoint);
    console.error(`Verified checkpoint factory: ${sha}`);
  } else throw new Error('Usage: handoff-control.mjs <resolve|verify> --event <file> --checkpoint <directory> [--current-sha <sha> --output <file>]');
}

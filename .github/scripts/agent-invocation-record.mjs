import { fileURLToPath } from 'node:url';
import { credentialNames } from './agent-adapter.mjs';
import { scrubHistoryFile, scrubSecrets } from './history-redaction.mjs';
// Capture only factory-visible inputs. CLI-internal prompts/subagents are not
// reconstructed, and hashing a Skill is not evidence that the Agent read it.
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildRedactor } from './agent-harness.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function beginInvocation({ log, prompt, workspace, engine, phase, secrets, env = process.env, contextFiles = [] }) {
  const knownRedact = buildRedactor(secrets);
  const redact = value => scrubSecrets(knownRedact(value));
  const context = [];
  function collect(relative) {
    const file = path.join(workspace, relative);
    let stat;
    try { stat = lstatSync(file); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const name of readdirSync(file).sort()) collect(`${relative}/${name}`);
    } else if (stat.isFile()) {
      context.push({ path: relative, sha256: sha256(readFileSync(file)) });
    }
  }
  for (const file of ['AGENTS.md', 'pnpm-lock.yaml', 'factory-template.json', '.agents/skills', ...contextFiles]) collect(file);
  mkdirSync(path.dirname(log), { recursive: true });
  const text = redact(readFileSync(prompt, 'utf8'));
  writeFileSync(`${log}.prompt.md`, text, { mode: 0o600 });
  const record = {
    version: 1,
    id: `${env.GITHUB_RUN_ID || 'local'}:${env.GITHUB_RUN_ATTEMPT || '1'}:${phase}:${randomUUID()}`,
    engine, phase, startedAt: new Date().toISOString(), status: 'preparing', invoked: false,
    controlSha: env.FACTORY_CONTROL_SHA || null,
    promptSha256: sha256(text), context,
    boundary: 'Factory prompt, invocation settings and available Skill hashes only; not CLI-internal prompts or proof of Skill usage.',
  };
  function save() {
    // JSON-encode individual strings after redaction, preserving valid JSON even
    // when a credential contains quotes or backslashes.
    writeFileSync(`${log}.invocation.json`, `${JSON.stringify(record, (_key, value) =>
      typeof value === 'string' ? redact(value) : value, 2)}\n`, { mode: 0o600 });
  }
  save();
  return {
    start({ command, args, model, actualVersion, configuredVersion }) {
      Object.assign(record, { command, args, model, actualVersion, configuredVersion,
        invoked: true, status: 'running' });
      save();
    },
    finish(error) {
      Object.assign(record, { status: error ? 'failed' : 'finished',
        endedAt: new Date().toISOString(), error: error?.message });
      save();
    },
  };
}

// Runs in the existing credential-bearing reply job, never the trusted publisher.
// Re-scrub on the always() path, including interrupted calls and partial replies.
export function stageReply(directory, metadata, env = process.env) {
  const target = path.join(directory, 'comment-artifacts');
  mkdirSync(target, { recursive: true });
  const redact = buildRedactor([...credentialNames.map(name => env[name]),
    env.FACTORY_ADMIN_PASSWORD, env.FACTORY_TEST_PASSWORD]);
  for (const [source, name] of [[path.join(directory, 'comment-reply.md'), 'comment-reply.md'],
    [metadata, 'task-metadata.json']]) {
    try {
      if (!lstatSync(source).isFile()) continue;
      writeFileSync(path.join(target, name), scrubHistoryFile(readFileSync(source, 'utf8'), name, redact), { mode: 0o600 });
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const name of readdirSync(target)) {
    if (!/^comment-agent\.jsonl(?:\.(?:result|invocation)\.json|\.prompt\.md)?$/.test(name)) continue;
    const file = path.join(target, name);
    if (!lstatSync(file).isFile()) continue;
    writeFileSync(file, scrubHistoryFile(readFileSync(file, 'utf8'), name, redact), { mode: 0o600 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'stage-reply') throw new Error('Expected stage-reply');
  stageReply(process.argv[3], process.argv[4]);
}

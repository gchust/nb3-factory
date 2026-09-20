import { recordTiming } from './timing.mjs';
import { resolveAgent } from './agent-registry.mjs';

// All adapters implement the same CLI: --workspace --prompt --log --agentDir.
// Completion is exit 0; failures must exit nonzero. Browser QA and repairs use
// this same entry point, without depending on an executor's event protocol.
const started = Date.now();
const log = process.argv[process.argv.indexOf('--log') + 1] ?? '';
const phase =
  process.env.FACTORY_AGENT_ROLE === 'qa'
    ? log.includes('report-repair')
      ? 'qa-report-repair'
      : 'qa'
    : log.includes('repair')
      ? 'repair'
      : 'implementation';
process.once('exit', (status) =>
  recordTiming(`agent:${phase}`, started, status),
);
await import(resolveAgent().module.href);

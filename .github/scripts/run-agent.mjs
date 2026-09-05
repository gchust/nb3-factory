import { resolveAgent } from './agent-registry.mjs';

// All adapters implement the same CLI: --workspace --prompt --log --agentDir.
// Completion is exit 0; failures must exit nonzero. Browser QA and repairs use
// this same entry point, without depending on an executor's event protocol.
await import(resolveAgent().module.href);

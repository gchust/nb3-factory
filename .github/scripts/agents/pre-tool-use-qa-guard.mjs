// Claude Code and Codex both block PreToolUse when the hook exits 2. The reason
// belongs on stderr (unlike CodeBuddy's existing stdout hook contract).
import { readFileSync } from 'node:fs';
import { isProcessTerminationCommand, QA_PROCESS_GUARD_REASON } from './qa-guard-rules.mjs';
let event;
try { event = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
if (event?.tool_name === 'Bash' && isProcessTerminationCommand(event.tool_input?.command)) {
  process.stderr.write(`${QA_PROCESS_GUARD_REASON}\n`);
  process.exitCode = 2;
}

// CodeBuddy PreToolUse hook for the QA role: the same preflight as the Pi
// extension, expressed as a hook process because CodeBuddy enforces permissions
// through settings hooks. Exit code 2 blocks the tool call and forwards stdout
// to the agent. Malformed or unmatched input allows the call: this guard stops
// accidental process termination, it is not a sandbox for arbitrary programs.
import {
  isProcessTerminationCommand,
  QA_PROCESS_GUARD_REASON,
} from './qa-guard-rules.mjs';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const toolName = String(payload?.tool_name ?? payload?.toolName ?? '');
const command = payload?.tool_input?.command ?? payload?.input?.command;
if (toolName.toLowerCase() === 'bash' && isProcessTerminationCommand(command)) {
  process.stdout.write(`${QA_PROCESS_GUARD_REASON}\n`);
  process.exit(2);
}
process.exit(0);

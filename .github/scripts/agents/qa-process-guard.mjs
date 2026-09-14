import {
  isProcessTerminationCommand,
  QA_PROCESS_GUARD_REASON,
} from './qa-guard-rules.mjs';

// Pi extension form of the shared QA preflight: it runs before the bash tool
// executes and blocks the call instead of terminating the supervisor's own
// process tree. The CodeBuddy engine enforces the same rule through
// codebuddy-qa-guard.mjs.
export default function registerQaProcessGuard(pi) {
  pi.on('tool_call', (event) => {
    if (event.toolName !== 'bash') return;
    if (!isProcessTerminationCommand(event.input?.command)) return;
    return { block: true, reason: QA_PROCESS_GUARD_REASON };
  });
}

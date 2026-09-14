// QA owns browser interactions, while the supervisor owns process lifecycles.
// In particular, pkill -f agent-browser also matches the supervisor's prompt and
// log paths. This preflight prevents accidental process termination; it is not an
// operating-system sandbox for arbitrary untrusted programs. Every engine has to
// enforce the same rule, so it lives here instead of in one engine's extension.
export const QA_PROCESS_GUARD_REASON =
  'QA must not terminate processes. Use agent-browser close followed by agent-browser open in the existing session, then authenticate and snapshot again. If browser input still fails, record the failure and return control to the factory supervisor.';

const PROCESS_TERMINATION_RE =
  /(?:^|[^\w-])(?:pkill|killall|kill|fuser)(?=$|[\s;'"])/u;

export function isProcessTerminationCommand(command) {
  return PROCESS_TERMINATION_RE.test(String(command ?? ''));
}
